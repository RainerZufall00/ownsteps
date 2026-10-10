import AVKit
import OwnStepsKit
import SwiftUI
import UIKit

/// A video as in a story: it plays by itself, muted and looping, while it's
/// the page in view, and stops when paged away, off screen or in the
/// background. No system controls – a tap switches the sound, a thin bar
/// shows the position, and a small button opens the system player for
/// scrubbing. Until the first frame is there, the poster stands in.
/// With "Auto-Play Video Previews" off, the poster waits with a play button.
struct StoryVideo: View {
    let account: Account
    let photo: Components.Schemas.Photo
    /// The page in view – only that one plays.
    let isActive: Bool
    /// Taps on the outer fifths move on or back instead of switching the sound.
    var edgeTap: ((_ forward: Bool) -> Void)?

    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    /// Created on the first play, dropped when the page leaves the screen.
    @State private var playback: VideoPlayback?
    @State private var onScreen = false
    @State private var autoplay = UIAccessibility.isVideoAutoplayEnabled
    /// Without autoplay: the play button was tapped while on this page.
    @State private var started = false
    /// The system player is up and in charge.
    @State private var inFullControls = false
    @State private var showsIndicator = false
    @State private var indicatorFlash = 0
    @State private var width: CGFloat = 0
    private let sound = VideoSound.shared

    private var waitsForPlay: Bool { !autoplay && !started }

    private var shouldPlay: Bool {
        isActive && onScreen && scenePhase == .active && !waitsForPlay
    }

    var body: some View {
        ZStack {
            RemoteImage(account: account, photo: photo, variant: .medium, contentMode: .fit)
            if let playback {
                PlayerLayerView(playback: playback)
                    .opacity(playback.isReadyForDisplay ? 1 : 0)
            }
        }
        .aspectRatio(Self.aspectRatio(of: photo), contentMode: .fit)
        .overlay(alignment: .bottom) {
            if let playback, playback.isReadyForDisplay, !waitsForPlay { controls(playback) }
        }
        .overlay {
            if waitsForPlay {
                Image(systemName: "play.fill")
                    .font(.title)
                    .frame(width: 72, height: 72)
                    .glassEffect(.regular, in: .circle)
            } else if showsIndicator {
                Image(systemName: sound.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    .font(.title3)
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 56, height: 56)
                    .glassEffect(.regular, in: .circle)
                    .transition(.opacity.combined(with: .scale(scale: 0.8)))
            }
        }
        .animation(.snappy, value: showsIndicator)
        .contentShape(.rect)
        .onTapGesture(coordinateSpace: .local) { location in tap(at: location) }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        .onAppear { onScreen = true }
        .onDisappear {
            onScreen = false
            stop()
            playback = nil
        }
        .onChange(of: shouldPlay, initial: true) { _, play in play ? start() : stop() }
        .onChange(of: isActive) { _, active in if !active { started = false } }
        // Back from the system player: on as before, muted or not.
        .onChange(of: inFullControls) { _, full in
            if !full { shouldPlay ? start() : stop() }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIAccessibility.videoAutoplayStatusDidChangeNotification)) { _ in
            autoplay = UIAccessibility.isVideoAutoplayEnabled
        }
        .task(id: indicatorFlash) {
            guard indicatorFlash > 0 else { return }
            showsIndicator = true
            try? await Task.sleep(for: .seconds(1.2))
            showsIndicator = false
        }
        .accessibilityActions {
            if waitsForPlay {
                Button("Play video") { started = true }
            } else {
                Button(sound.isMuted ? "Turn sound on" : "Turn sound off", action: toggleSound)
            }
            Button("Show playback controls", action: showFullControls)
        }
    }

    /// The position as a hairline at the bottom, the way out to the system
    /// player just above it.
    private func controls(_ playback: VideoPlayback) -> some View {
        VStack(alignment: .trailing, spacing: 10) {
            Button(action: showFullControls) {
                Image(systemName: "arrow.up.left.and.arrow.down.right")
                    .font(.footnote.weight(.semibold))
                    .frame(width: 34, height: 34)
            }
            .buttonStyle(.glass)
            .buttonBorderShape(.circle)
            .accessibilityLabel(Text("Show playback controls"))
            GeometryReader { geometry in
                Capsule()
                    .fill(.white.opacity(0.3))
                    .overlay(alignment: .leading) {
                        Capsule()
                            .fill(.white.opacity(0.95))
                            .frame(width: geometry.size.width * playback.progress)
                    }
            }
            .frame(height: 2.5)
            .shadow(color: .black.opacity(0.3), radius: 2)
            .accessibilityHidden(true)
        }
        .padding(.horizontal, 10)
        .padding(.bottom, 8)
    }

    private func tap(at location: CGPoint) {
        if let edgeTap, width > 0 {
            if location.x < width * 0.2 { return edgeTap(false) }
            if location.x > width * 0.8 { return edgeTap(true) }
        }
        if waitsForPlay {
            started = true
        } else {
            toggleSound()
        }
    }

    /// For every video at once; the others take it over when they start.
    private func toggleSound() {
        sound.toggle()
        playback?.player.isMuted = sound.isMuted
        indicatorFlash += 1
    }

    private func start() {
        guard !inFullControls, let playback = playback ?? makePlayback() else { return }
        playback.player.isMuted = sound.isMuted
        sound.started(playback)
        playback.player.play()
        // Shows that the video is silent and a tap brings the sound.
        if sound.isMuted { indicatorFlash += 1 }
    }

    private func stop() {
        guard !inFullControls, let playback else { return }
        playback.player.pause()
        sound.stopped(playback)
    }

    private func makePlayback() -> VideoPlayback? {
        let playback = VideoPlayback(request: model.client(for: account).mediaRequest(photoID: photo.id, variant: .video))
        self.playback = playback
        return playback
    }

    /// The system's own player over everything, with sound, for scrubbing.
    /// It shares the player, so the story goes on from where it was left.
    private func showFullControls() {
        guard let playback = playback ?? makePlayback(), let presenter = UIApplication.shared.topViewController else { return }
        inFullControls = true
        started = true
        playback.player.isMuted = false
        sound.started(playback, forceSound: true)
        let controller = AVPlayerViewController()
        controller.player = playback.player
        // Over full screen: the story underneath stays in place and doesn't
        // see itself disappear.
        controller.modalPresentationStyle = .overFullScreen
        playback.fullControlsDelegate = FullControlsDelegate { inFullControls = false }
        controller.delegate = playback.fullControlsDelegate
        presenter.present(controller, animated: true) { playback.player.play() }
    }

    private static func aspectRatio(of photo: Components.Schemas.Photo) -> CGFloat? {
        photo.width > 0 && photo.height > 0 ? CGFloat(photo.width) / CGFloat(photo.height) : nil
    }
}

/// Sound for all story videos at once: off until a tap, then on for the
/// next video too, until the app starts again. Muted, the audio session is
/// ambient and mixes with whatever else plays – the user's music keeps
/// going. With sound it switches to playback, and hands the audio back once
/// no video plays anymore.
@Observable
final class VideoSound {
    static let shared = VideoSound()

    private(set) var isMuted = true
    @ObservationIgnored private var playing: Set<ObjectIdentifier> = []
    @ObservationIgnored private var holdsAudio = false

    func toggle() {
        isMuted.toggle()
        configure(sound: !isMuted)
    }

    func started(_ playback: VideoPlayback, forceSound: Bool = false) {
        playing.insert(ObjectIdentifier(playback))
        configure(sound: forceSound || !isMuted)
    }

    func stopped(_ playback: VideoPlayback) {
        playing.remove(ObjectIdentifier(playback))
        // Paging stops one video and starts the next in the same moment:
        // let go only if none started meanwhile, or the next one would be
        // cut off.
        Task {
            guard playing.isEmpty, holdsAudio else { return }
            holdsAudio = false
            let session = AVAudioSession.sharedInstance()
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            try? session.setCategory(.ambient)
        }
    }

    private func configure(sound: Bool) {
        let session = AVAudioSession.sharedInstance()
        if sound {
            try? session.setCategory(.playback, mode: .moviePlayback)
            try? session.setActive(true)
            holdsAudio = true
        } else {
            try? session.setCategory(.ambient)
        }
    }
}

/// One video's player: looping, streamed with the account's token, with its
/// position for the progress bar.
@Observable
final class VideoPlayback {
    let player: AVPlayer
    private(set) var progress: Double = 0
    /// The first frame is there; the poster can step aside.
    fileprivate(set) var isReadyForDisplay = false
    @ObservationIgnored fileprivate var fullControlsDelegate: FullControlsDelegate?
    @ObservationIgnored private var timeObserver: Any?
    @ObservationIgnored private var loopObserver: NSObjectProtocol?

    init(request: URLRequest) {
        // AVPlayer has no public way to add headers; this asset option is
        // the long-standing, widely used one.
        let asset = AVURLAsset(
            url: request.url ?? URL(filePath: "/"),
            options: ["AVURLAssetHTTPHeaderFieldsKey": request.allHTTPHeaderFields ?? [:]]
        )
        let item = AVPlayerItem(asset: asset)
        player = AVPlayer(playerItem: item)
        player.isMuted = true
        // Looping by seeking back keeps what was buffered; no reload per round.
        player.actionAtItemEnd = .none
        loopObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification, object: item, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.player.seek(to: .zero) }
        }
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 20), queue: .main) { [weak self] time in
            MainActor.assumeIsolated { self?.update(time) }
        }
    }

    isolated deinit {
        if let timeObserver { player.removeTimeObserver(timeObserver) }
        if let loopObserver { NotificationCenter.default.removeObserver(loopObserver) }
    }

    private func update(_ time: CMTime) {
        guard let duration = player.currentItem?.duration, duration.isNumeric, duration.seconds > 0 else { return }
        progress = min(max(time.seconds / duration.seconds, 0), 1)
    }
}

/// Reports when the system player is closed.
final class FullControlsDelegate: NSObject, AVPlayerViewControllerDelegate {
    private let onClose: () -> Void

    init(onClose: @escaping () -> Void) {
        self.onClose = onClose
    }

    func playerViewController(
        _ playerViewController: AVPlayerViewController,
        willEndFullScreenPresentationWithAnimationCoordinator coordinator: any UIViewControllerTransitionCoordinator
    ) {
        coordinator.animate(alongsideTransition: nil) { [onClose] context in
            if !context.isCancelled { onClose() }
        }
    }
}

/// The video's frames in an `AVPlayerLayer`, clear until the first one is
/// there.
private struct PlayerLayerView: UIViewRepresentable {
    let playback: VideoPlayback

    func makeUIView(context: Context) -> PlayerUIView {
        let view = PlayerUIView()
        view.backgroundColor = .clear
        view.attach(playback)
        return view
    }

    func updateUIView(_ view: PlayerUIView, context: Context) {
        view.attach(playback)
    }

    static func dismantleUIView(_ view: PlayerUIView, coordinator: ()) {
        view.attach(nil)
    }
}

private final class PlayerUIView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    private var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    private weak var playback: VideoPlayback?
    private var readiness: NSKeyValueObservation?

    func attach(_ playback: VideoPlayback?) {
        guard playback !== self.playback || playback == nil else { return }
        self.playback = playback
        playerLayer.videoGravity = .resizeAspect
        playerLayer.player = playback?.player
        readiness = playback.map { _ in
            playerLayer.observe(\.isReadyForDisplay, options: [.initial, .new]) { [weak self] layer, _ in
                let ready = layer.isReadyForDisplay
                Task { @MainActor in self?.playback?.isReadyForDisplay = ready }
            }
        }
    }
}
