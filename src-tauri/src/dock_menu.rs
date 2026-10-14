//! Add a Dock action without replacing Tauri's application delegate.
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Sel};
use objc2::{define_class, msg_send, sel, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSApplication, NSApplicationTerminateReply, NSMenu, NSMenuItem};
use objc2_foundation::{NSObject, NSObjectProtocol, NSString};
use std::cell::RefCell;
use tauri::{Emitter, Manager};

thread_local! {
    static DOCK: RefCell<Option<(Retained<NSMenu>, Retained<DockActions>, tauri::AppHandle)>> = const { RefCell::new(None) };
}
define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    struct DockActions;
    unsafe impl NSObjectProtocol for DockActions {}
    impl DockActions {
        #[unsafe(method(newEditorWindow:))]
        fn new_editor_window(&self, _sender: Option<&AnyObject>) {
            let app = DOCK.with(|slot| slot.borrow().as_ref().map(|(_, _, app)| app.clone()));
            if let Some(app) = app {
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = crate::editor_windows::new_window(app.clone()).await {
                        log::error!("Dock new window: {error}");
                        if let Some(window) = crate::editor_windows::target(&app) { let _ = app.emit_to(window.label(), "new-window-error", error); }
                    }
                });
            }
        }
    }
);
// AppKit borrows this menu; DOCK retains it until the next localized rebuild.
extern "C-unwind" fn application_dock_menu(_: &AnyObject, _: Sel, _: &AnyObject) -> *const NSMenu {
    DOCK.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or(std::ptr::null(), |(menu, _, _)| &**menu)
    })
}

// AppKit's standard Quit menu and Dock Quit call terminate: directly. Tao only
// observes applicationWillTerminate, which is too late to await WebView writes.
// Defer that path into Tauri's cancellable ExitRequested handshake instead.
extern "C-unwind" fn application_should_terminate(
    _: &AnyObject,
    _: Sel,
    _: &AnyObject,
) -> NSApplicationTerminateReply {
    let app = DOCK.with(|slot| slot.borrow().as_ref().map(|(_, _, app)| app.clone()));
    let Some(app) = app else { return NSApplicationTerminateReply::TerminateNow; };
    if app.state::<crate::editor_windows::Windows>().0.lock().unwrap().allow_exit {
        return NSApplicationTerminateReply::TerminateNow;
    }
    log::info!("Native quit waits for editor recovery snapshots");
    app.exit(0);
    NSApplicationTerminateReply::TerminateCancel
}

pub fn install(app: &tauri::AppHandle, label: &str) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.clone();
    let label = label.to_owned();
    app.run_on_main_thread(move || {
        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };
        let application = NSApplication::sharedApplication(mtm);
        let Some(delegate) = application.delegate() else {
            log::error!("Dock menu: missing application delegate");
            return;
        };
        DOCK.with(|slot| {
            if slot.borrow().is_none() {
                // Tauri/Tao has no Dock-menu hook. Add only this optional AppKit
                // delegate selector; all lifecycle and file-open methods remain intact.
                let class: *mut objc2::runtime::AnyClass = unsafe { msg_send![&*delegate, class] };
                let added = unsafe {
                    objc2::ffi::class_addMethod(
                        class,
                        sel!(applicationDockMenu:),
                        std::mem::transmute::<
                            extern "C-unwind" fn(&AnyObject, Sel, &AnyObject) -> *const NSMenu,
                            objc2::runtime::Imp,
                        >(application_dock_menu),
                        c"@@:@".as_ptr(),
                    )
                };
                if !added.as_bool() {
                    log::error!("Dock menu: applicationDockMenu already installed");
                    return;
                }
                let termination_added = unsafe {
                    objc2::ffi::class_addMethod(
                        class,
                        sel!(applicationShouldTerminate:),
                        std::mem::transmute::<
                            extern "C-unwind" fn(&AnyObject, Sel, &AnyObject) -> NSApplicationTerminateReply,
                            objc2::runtime::Imp,
                        >(application_should_terminate),
                        c"Q@:@".as_ptr(),
                    )
                };
                if !termination_added.as_bool() {
                    log::error!("Native quit: applicationShouldTerminate already installed");
                }
            }
            let menu = NSMenu::initWithTitle(NSMenu::alloc(mtm), &NSString::from_str("DEditor"));
            let target: Retained<DockActions> = unsafe { msg_send![DockActions::alloc(mtm), init] };
            let item = unsafe {
                NSMenuItem::initWithTitle_action_keyEquivalent(
                    NSMenuItem::alloc(mtm),
                    &NSString::from_str(&label),
                    Some(sel!(newEditorWindow:)),
                    &NSString::from_str(""),
                )
            };
            unsafe {
                item.setTarget(Some(&target));
            }
            menu.addItem(&item);
            *slot.borrow_mut() = Some((menu, target, app_handle));
        });
    })?;
    Ok(())
}
