//! macOS fullscreen chrome. AppKit draws the buttons in both window modes.
//! The detached fullscreen titlebar is hidden while our native button host is
//! visible, so revealing the menu bar cannot expose another row of controls.
use std::cell::{Cell, RefCell};

use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Bool};
use objc2::{
    define_class, msg_send, sel, AnyThread, DefinedClass, MainThreadMarker, MainThreadOnly,
};
use objc2_app_kit::{
    NSButton, NSEvent, NSTrackingArea, NSTrackingAreaOptions, NSView, NSWindow, NSWindowButton,
    NSWindowDidExitFullScreenNotification, NSWindowDidMiniaturizeNotification, NSWindowStyleMask,
};
use objc2_foundation::{
    NSNotification, NSNotificationCenter, NSObject, NSObjectProtocol, NSPoint, NSRect, NSSize,
};
use tauri::Manager;

const TITLEBAR_HEIGHT: f64 = 40.0;
const BUTTON_LEFT: f64 = 14.0;

thread_local! {
    static CHROME: RefCell<Option<Chrome>> = const { RefCell::new(None) };
    static TITLEBAR_VISIBLE: Cell<bool> = const { Cell::new(true) };
}

#[derive(Default)]
struct ButtonHoverState {
    inside: Cell<bool>,
    #[cfg(debug_assertions)]
    reported_hover: Cell<bool>,
}

// Standard window buttons placed outside AppKit's titlebar need their own
// shared tracking area. Let AppKit draw the hover glyphs for all three buttons.
define_class!(
    #[unsafe(super(NSView))]
    #[thread_kind = MainThreadOnly]
    #[ivars = ButtonHoverState]
    struct FullscreenButtonsView;

    unsafe impl NSObjectProtocol for FullscreenButtonsView {}

    impl FullscreenButtonsView {
        // AppKit's standard window-button cells query their host for this
        // group state when drawing glyphs. Merely setting highlighted only
        // changes the pressed appearance. Isolate this AppKit compatibility
        // hook here; never replace the system buttons or draw their icons.
        #[unsafe(method(_mouseInGroup:))]
        fn mouse_in_group(&self, _button: &NSButton) -> Bool {
            let inside = self.ivars().inside.get();
            #[cfg(debug_assertions)]
            if inside && !self.ivars().reported_hover.replace(true) {
                log::info!("native fullscreen buttons drawing hover glyphs");
            }
            Bool::new(inside)
        }

        #[unsafe(method(mouseEntered:))]
        fn mouse_entered(&self, _event: &NSEvent) {
            self.set_group_hover(true);
        }

        #[unsafe(method(mouseExited:))]
        fn mouse_exited(&self, _event: &NSEvent) {
            self.set_group_hover(false);
        }
    }
);

impl FullscreenButtonsView {
    fn set_group_hover(&self, hovered: bool) {
        if self.ivars().inside.replace(hovered) == hovered {
            return;
        }
        // AppKit can return private widget classes from standardWindowButton.
        // Invalidate each child as an NSView rather than requiring NSButton's
        // concrete runtime class (which would skip those native widgets).
        for view in self.subviews() {
            // Window widgets expose NSControl's no-argument invalidation
            // selector; this also refreshes their internally cached artwork.
            unsafe {
                let _: () = msg_send![&*view, setNeedsDisplay];
            }
            view.displayIfNeeded();
        }
    }

    fn sync_hover(&self) {
        let hovered = self.window().is_some_and(|window| {
            let point =
                self.convertPoint_fromView(window.mouseLocationOutsideOfEventStream(), None);
            self.mouse_inRect(point, self.bounds())
        });
        self.set_group_hover(hovered);
    }
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    struct WindowChromeActions;

    unsafe impl NSObjectProtocol for WindowChromeActions {}

    impl WindowChromeActions {
        #[unsafe(method(minimizeFromFullscreen:))]
        fn minimize_from_fullscreen(&self, _sender: Option<&AnyObject>) {
            let window = CHROME.with(|slot| {
                let mut state = slot.borrow_mut();
                let state = state.as_mut()?;
                if state.minimize_after_exit { return None; }
                state.minimize_after_exit = true;
                Some(state.window.clone())
            });
            if let Some(window) = window {
                window.toggleFullScreen(None);
            }
        }

        #[unsafe(method(didExitFullscreen:))]
        fn did_exit_fullscreen(&self, _notification: &NSNotification) {
            // Wait for the notification/delegate stack (including Tao's
            // geometry restoration) to unwind before starting another animation.
            unsafe {
                let _: () = msg_send![self, performSelector: sel!(finishMinimize:), withObject: None::<&AnyObject>, afterDelay: 0.0_f64];
            }
        }

        #[unsafe(method(finishMinimize:))]
        fn finish_minimize(&self, _sender: Option<&AnyObject>) {
            let window = CHROME.with(|slot| {
                let mut state = slot.borrow_mut();
                let state = state.as_mut()?;
                if !state.minimize_after_exit { return None; }
                state.minimize_after_exit = false;
                Some(state.window.clone())
            });
            if let Some(window) = window { window.miniaturize(None); }
        }

        #[unsafe(method(didMiniaturize:))]
        fn did_miniaturize(&self, _notification: &NSNotification) {
            log::info!("native window minimization completed");
        }
    }
);

struct Chrome {
    window: Retained<NSWindow>,
    actions: Retained<WindowChromeActions>,
    host: Option<Retained<FullscreenButtonsView>>,
    buttons: Vec<Retained<NSButton>>,
    hidden_overlay: Option<(Retained<NSView>, bool)>,
    sizes: [NSSize; 3],
    spacing: f64,
    minimize_after_exit: bool,
}

impl Drop for Chrome {
    fn drop(&mut self) {
        unsafe { NSNotificationCenter::defaultCenter().removeObserver(&self.actions) };
    }
}

impl Chrome {
    fn remove_host(&mut self) {
        if let Some(host) = self.host.take() {
            host.removeFromSuperview();
            self.buttons.clear();
            log::info!("native fullscreen controls removed");
        }
        if let Some((overlay, was_hidden)) = self.hidden_overlay.take() {
            overlay.setHidden(was_hidden);
        }
    }

    fn sync(&mut self, mtm: MainThreadMarker) {
        if !TITLEBAR_VISIBLE.get()
            || !self
                .window
                .styleMask()
                .contains(NSWindowStyleMask::FullScreen)
        {
            self.remove_host();
            return;
        }
        let Some(content) = self.window.contentView() else {
            return;
        };
        // AppKit moves its titlebar to a separate window in fullscreen. Hide
        // that window's content, never the editor's own content view. Follow
        // the actual button/window relationship rather than a private class name.
        if self.hidden_overlay.is_none() {
            if let Some(original) = self
                .window
                .standardWindowButton(NSWindowButton::CloseButton)
            {
                if let Some(owner) = original.window() {
                    if !std::ptr::eq(&*owner, &*self.window) {
                        if let Some(overlay) = owner.contentView() {
                            let was_hidden = overlay.isHidden();
                            overlay.setHidden(true);
                            self.hidden_overlay = Some((overlay, was_hidden));
                            log::info!("native fullscreen titlebar overlay suppressed");
                        }
                    }
                }
            }
        }
        if self.host.is_none() {
            let host: Retained<FullscreenButtonsView> = unsafe {
                let allocated =
                    FullscreenButtonsView::alloc(mtm).set_ivars(ButtonHoverState::default());
                msg_send![super(allocated), initWithFrame: NSRect::ZERO]
            };
            // The view owns the tracking area. InVisibleRect follows layout and
            // fullscreen resizing without retaining stale tracking rectangles.
            let tracking = unsafe {
                NSTrackingArea::initWithRect_options_owner_userInfo(
                    NSTrackingArea::alloc(),
                    NSRect::ZERO,
                    NSTrackingAreaOptions::MouseEnteredAndExited
                        | NSTrackingAreaOptions::ActiveAlways
                        | NSTrackingAreaOptions::InVisibleRect,
                    Some(&host),
                    None,
                )
            };
            host.addTrackingArea(&tracking);
            let kinds = [
                NSWindowButton::CloseButton,
                NSWindowButton::MiniaturizeButton,
                NSWindowButton::ZoomButton,
            ];
            let mut buttons = Vec::with_capacity(3);
            for kind in kinds {
                let Some(button) =
                    NSWindow::standardWindowButton_forStyleMask(kind, self.window.styleMask(), mtm)
                else {
                    log::error!("AppKit could not create a native window button");
                    self.remove_host();
                    return;
                };
                // Retained targets outlive the buttons; selectors have the
                // standard single-object AppKit action signature.
                unsafe {
                    if kind == NSWindowButton::MiniaturizeButton {
                        button.setTarget(Some(&self.actions));
                        button.setAction(Some(sel!(minimizeFromFullscreen:)));
                    } else {
                        button.setTarget(Some(&self.window));
                        button.setAction(Some(if kind == NSWindowButton::CloseButton {
                            sel!(performClose:)
                        } else {
                            sel!(toggleFullScreen:)
                        }));
                    }
                    host.addSubview(&button);
                }
                button.setEnabled(true);
                buttons.push(button);
            }
            content.addSubview(&host);
            self.buttons = buttons;
            self.host = Some(host);
            log::info!(
                "native fullscreen controls installed: sizes={:?}, spacing={}",
                self.sizes,
                self.spacing
            );
        }
        let host = self.host.as_ref().unwrap();
        let bounds = content.bounds();
        let y = if content.isFlipped() {
            0.0
        } else {
            bounds.size.height - TITLEBAR_HEIGHT
        };
        host.setFrame(NSRect::new(
            NSPoint::new(0.0, y),
            NSSize::new(84.0, TITLEBAR_HEIGHT),
        ));
        for (i, button) in self.buttons.iter().enumerate() {
            button.setFrame(button_frame(i, self.sizes[i], self.spacing));
        }
        // Fullscreen may begin with the pointer already over this group.
        host.sync_hover();
    }
}

fn button_frame(index: usize, size: NSSize, spacing: f64) -> NSRect {
    NSRect::new(
        NSPoint::new(
            BUTTON_LEFT + index as f64 * spacing,
            (TITLEBAR_HEIGHT - size.height) / 2.0,
        ),
        size,
    )
}

pub fn schedule_sync(app: &tauri::AppHandle) {
    schedule_update(app, None);
}

pub fn set_visible(app: &tauri::AppHandle, visible: bool) {
    schedule_update(app, Some(visible));
}

fn schedule_update(app: &tauri::AppHandle, visible: Option<bool>) {
    let handle = app.clone();
    if let Err(err) = app.run_on_main_thread(move || {
        if let Some(visible) = visible {
            TITLEBAR_VISIBLE.set(visible);
        }
        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };
        let Some(webview) = handle.get_webview_window("main") else {
            return;
        };
        let pointer = match webview.ns_window() {
            Ok(pointer) => pointer,
            Err(err) => {
                log::error!("Get native window for titlebar failed: {err}");
                return;
            }
        };
        // Tauri owns the NSWindow and this callback runs on AppKit's main
        // thread. Retain it for the lifetime of the installed native controls.
        let window = unsafe { Retained::retain(pointer.cast::<NSWindow>()) };
        let Some(window) = window else { return };
        CHROME.with(|slot| {
            let Ok(mut slot) = slot.try_borrow_mut() else {
                return;
            };
            if slot.is_none() {
                let kinds = [
                    NSWindowButton::CloseButton,
                    NSWindowButton::MiniaturizeButton,
                    NSWindowButton::ZoomButton,
                ];
                let originals: Vec<_> = kinds
                    .into_iter()
                    .filter_map(|kind| window.standardWindowButton(kind))
                    .collect();
                if originals.len() != 3 {
                    return;
                }
                let sizes = std::array::from_fn(|i| originals[i].frame().size);
                let spacing = originals[1].frame().origin.x - originals[0].frame().origin.x;
                let actions: Retained<WindowChromeActions> =
                    unsafe { msg_send![WindowChromeActions::alloc(mtm), init] };
                // These notifications are scoped to this window, and the
                // retained action target is unregistered before being dropped.
                unsafe {
                    let center = NSNotificationCenter::defaultCenter();
                    center.addObserver_selector_name_object(
                        &actions,
                        sel!(didExitFullscreen:),
                        Some(NSWindowDidExitFullScreenNotification),
                        Some(&window),
                    );
                    center.addObserver_selector_name_object(
                        &actions,
                        sel!(didMiniaturize:),
                        Some(NSWindowDidMiniaturizeNotification),
                        Some(&window),
                    );
                }
                *slot = Some(Chrome {
                    window,
                    actions,
                    host: None,
                    buttons: Vec::new(),
                    hidden_overlay: None,
                    sizes,
                    spacing,
                    minimize_after_exit: false,
                });
            }
            if let Some(chrome) = slot.as_mut() {
                chrome.sync(mtm);
            }
        });
    }) {
        log::error!("Schedule native titlebar update failed: {err}");
    }
}

pub fn clear() {
    CHROME.with(|slot| {
        if let Ok(mut slot) = slot.try_borrow_mut() {
            if let Some(mut state) = slot.take() {
                state.remove_host();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_button_sizes_are_preserved() {
        for size in [NSSize::new(14.0, 16.0), NSSize::new(16.0, 16.0)] {
            assert_eq!(button_frame(0, size, 22.0).size, size);
        }
    }
    #[test]
    fn all_buttons_share_titlebar_center() {
        for i in 0..3 {
            let frame = button_frame(i, NSSize::new(14.0, 16.0), 22.0);
            assert_eq!(frame.origin.y + frame.size.height / 2.0, 20.0);
            assert_eq!(frame.origin.x, 14.0 + i as f64 * 22.0);
        }
    }
}
