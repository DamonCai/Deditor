//! Dispatch the native Save key equivalent before WKWebView's input method.
//!
//! While composing, WebKit can insert the command's `s` before delivering its
//! DOM keydown. A JavaScript handler is too late. This app-local monitor only
//! offers unmodified Command+S in an editor window to the existing native menu;
//! the native menu retains its disabled/unbound behavior. Native dialogs keep
//! normal event routing.
use block2::RcBlock;
use objc2::{rc::Retained, runtime::AnyObject, MainThreadMarker};
use objc2_app_kit::{NSApplication, NSEvent, NSEventMask, NSEventModifierFlags};
use std::{cell::RefCell, ptr::NonNull};
use tauri::Manager;

struct Monitor(Retained<AnyObject>);
impl Drop for Monitor {
    fn drop(&mut self) {
        // The token was returned by addLocalMonitor..., retained on this thread.
        unsafe { NSEvent::removeMonitor(&self.0) };
    }
}
thread_local! {
    static MONITOR: RefCell<Option<Monitor>> = const { RefCell::new(None) };
}

fn is_save_key(event: &NSEvent) -> bool {
    let flags = event.modifierFlags();
    let command_modifiers = NSEventModifierFlags::Command
        | NSEventModifierFlags::Control
        | NSEventModifierFlags::Option
        | NSEventModifierFlags::Shift;
    flags.intersection(command_modifiers) == NSEventModifierFlags::Command
        && event
            .charactersIgnoringModifiers()
            .is_some_and(|text| text.to_string().eq_ignore_ascii_case("s"))
}

// Return true only when the native menu consumed the event. Keeping the
// dispatcher separate lets the native tests verify actual menu semantics.
pub(crate) fn dispatch_save(
    event: &NSEvent,
    eligible_window: bool,
    dispatch: impl FnOnce() -> bool,
) -> bool {
    eligible_window && is_save_key(event) && dispatch()
}

pub fn install(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let mtm =
        MainThreadMarker::new().ok_or("Save shortcut monitor must install on the main thread")?;
    let handle = app.clone();
    MONITOR.with(|slot| {
        if slot.borrow().is_some() {
            return Ok(());
        }
        let handler = RcBlock::new(move |pointer: NonNull<NSEvent>| -> *mut NSEvent {
            // AppKit supplies a live event; returning it unchanged passes it on.
            let event = unsafe { pointer.as_ref() };
            if !is_save_key(event) {
                return pointer.as_ptr();
            }
            let application = NSApplication::sharedApplication(mtm);
            let Some(window) = event.window(mtm) else {
                return pointer.as_ptr();
            };
            if !window.isKeyWindow()
                || application.modalWindow().is_some()
                || window.attachedSheet().is_some()
            {
                return pointer.as_ptr();
            }
            let native = Retained::as_ptr(&window) as *mut std::ffi::c_void;
            let editor_window = handle
                .webview_windows()
                .values()
                .any(|view| view.ns_window().is_ok_and(|ptr| ptr == native));
            let consumed = dispatch_save(event, editor_window, || {
                application
                    .mainMenu()
                    .is_some_and(|menu| menu.performKeyEquivalent(event))
            });
            if consumed {
                std::ptr::null_mut()
            } else {
                pointer.as_ptr()
            }
        });
        let token = unsafe {
            NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::KeyDown, &handler)
        }
        .ok_or("Could not install the native Save shortcut monitor")?;
        *slot.borrow_mut() = Some(Monitor(token));
        Ok(())
    })
}

pub fn uninstall() {
    MONITOR.with(|slot| {
        slot.borrow_mut().take();
    });
}
