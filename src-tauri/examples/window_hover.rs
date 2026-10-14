// Render the production native button host offscreen. No desktop capture,
// user window interaction or persisted editor state is involved.
#[cfg(target_os = "macos")]
mod probe {
    #![allow(dead_code)]
    include!("../src/window_chrome.rs");

    pub fn run() {
        use objc2_app_kit::{NSApplication, NSBackingStoreType, NSBitmapImageFileType};
        use objc2_foundation::NSDictionary;
        let mtm = MainThreadMarker::new().expect("AppKit requires the main thread");
        let _app = NSApplication::sharedApplication(mtm);
        let style = NSWindowStyleMask::Titled
            | NSWindowStyleMask::Closable
            | NSWindowStyleMask::Miniaturizable
            | NSWindowStyleMask::Resizable;
        let window = unsafe {
            NSWindow::initWithContentRect_styleMask_backing_defer(
                NSWindow::alloc(mtm),
                NSRect::new(NSPoint::ZERO, NSSize::new(180.0, 80.0)),
                style,
                NSBackingStoreType::Buffered,
                false,
            )
        };
        unsafe {
            window.setReleasedWhenClosed(false);
        }
        let host: Retained<FullscreenButtonsView> = unsafe {
            msg_send![FullscreenButtonsView::alloc(mtm), initWithFrame: NSRect::new(NSPoint::ZERO, NSSize::new(84.0, 40.0))]
        };
        host.setWantsLayer(true);
        for (i, kind) in [
            NSWindowButton::CloseButton,
            NSWindowButton::MiniaturizeButton,
            NSWindowButton::ZoomButton,
        ]
        .into_iter()
        .enumerate()
        {
            let button = NSWindow::standardWindowButton_forStyleMask(
                kind,
                style | NSWindowStyleMask::FullScreen,
                mtm,
            )
            .unwrap();
            button.setFrame(button_frame(i, NSSize::new(14.0, 14.0), 23.0));
            button.setEnabled(true);
            host.addSubview(&button);
        }
        window.contentView().unwrap().addSubview(&host);
        let output = std::env::args()
            .nth(1)
            .unwrap_or_else(|| "/tmp/deditor-native-hover-render".into());
        std::fs::create_dir_all(&output).unwrap();
        let render = |name: &str| {
            let bitmap = host
                .bitmapImageRepForCachingDisplayInRect(host.bounds())
                .unwrap();
            host.cacheDisplayInRect_toBitmapImageRep(host.bounds(), &bitmap);
            let data = unsafe {
                bitmap.representationUsingType_properties(
                    NSBitmapImageFileType::PNG,
                    &NSDictionary::new(),
                )
            }
            .unwrap()
            .to_vec();
            std::fs::write(format!("{output}/{name}.png"), &data).unwrap();
            data
        };
        host.set_group_hover(false);
        let idle = render("idle");
        host.set_group_hover(true);
        let hover = render("hover");
        assert_ne!(idle, hover, "hover must change the actual rendered pixels");
        host.set_group_hover(false);
        assert_eq!(idle, render("idle-again"), "all glyphs must clear on exit");
        host.set_group_hover(true);
        assert_eq!(
            hover,
            render("hover-again"),
            "all glyphs must return together"
        );
        // Reproduce each child independently losing hover while the group is
        // still entered (moving between native widgets / popup tracking).
        for (i, view) in host.subviews().into_iter().enumerate() {
            unsafe {
                let _: () = msg_send![&*view, setHighlighted: Bool::NO];
            }
            host.set_group_hover(true);
            assert_eq!(
                hover,
                render(&format!("repaired-{i}")),
                "widget {i} must rejoin group hover"
            );
        }
        host.set_group_hover(false);
        for (i, view) in host.subviews().into_iter().enumerate() {
            unsafe {
                let _: () = msg_send![&*view, setHighlighted: Bool::YES];
            }
            host.set_group_hover(false);
            assert_eq!(
                idle,
                render(&format!("cleared-{i}")),
                "widget {i} must clear stale hover"
            );
        }
        println!("PASS: enter/exit/re-enter and all 6 individual-widget recovery cases");
        println!("Rendered production native hover states to {output}");
    }
}

fn main() {
    #[cfg(target_os = "macos")]
    probe::run();
}
