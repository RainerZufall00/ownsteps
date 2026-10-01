import AVKit
import OwnStepsKit
import SwiftUI

/// Fullscreen photos and videos of one step, paged sideways.
struct PhotoViewer: View {
    let account: Account
    let photos: [Components.Schemas.Photo]
    let startIndex: Int

    @Environment(\.dismiss) private var dismiss
    @State private var index = 0

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            TabView(selection: $index) {
                ForEach(Array(photos.enumerated()), id: \.element.id) { offset, photo in
                    Group {
                        if photo.mediaType == .video {
                            VideoPage(account: account, photo: photo, isCurrent: offset == index)
                        } else {
                            ZoomablePhoto(account: account, photo: photo)
                        }
                    }
                    .tag(offset)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea()
        }
        .overlay(alignment: .top) {
            HStack {
                // Videos bring their own controls in this corner.
                if photos[safe: index]?.mediaType != .video {
                    Text("\(index + 1) / \(photos.count)")
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.white.opacity(0.8))
                }
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.headline)
                        .padding(10)
                }
                .buttonStyle(.glass)
                .accessibilityLabel(Text("Close"))
            }
            .padding(.horizontal)
        }
        .overlay(alignment: .bottom) {
            if let caption = photos[safe: index]?.caption, !caption.isEmpty {
                Text(caption)
                    .font(.callout)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(.black.opacity(0.4))
            }
        }
        .onAppear { index = startIndex }
        .statusBarHidden()
    }
}

/// Pinch or double-tap to zoom, drag to look around.
struct ZoomablePhoto: View {
    let account: Account
    let photo: Components.Schemas.Photo

    @State private var scale: CGFloat = 1
    @State private var baseScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var baseOffset: CGSize = .zero

    var body: some View {
        RemoteImage(account: account, photo: photo, variant: .large, contentMode: .fit, fallbacks: [.medium, .thumb])
            .aspectRatio(CGFloat(photo.width) / CGFloat(max(photo.height, 1)), contentMode: .fit)
            .scaleEffect(scale)
            .offset(offset)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(.rect)
            .gesture(
                MagnifyGesture()
                    .onChanged { scale = min(max(baseScale * $0.magnification, 1), 4) }
                    .onEnded { _ in
                        baseScale = scale
                        if scale <= 1 { reset() }
                    }
            )
            // Panning only while zoomed, so paging keeps working otherwise.
            .simultaneousGesture(
                DragGesture()
                    .onChanged { value in
                        guard scale > 1 else { return }
                        offset = CGSize(
                            width: baseOffset.width + value.translation.width,
                            height: baseOffset.height + value.translation.height
                        )
                    }
                    .onEnded { _ in baseOffset = offset },
                isEnabled: scale > 1
            )
            .onTapGesture(count: 2) {
                withAnimation(.spring) {
                    if scale > 1 { reset() } else { scale = 2.5; baseScale = 2.5 }
                }
            }
    }

    private func reset() {
        scale = 1
        baseScale = 1
        offset = .zero
        baseOffset = .zero
    }
}

/// Streams the video with the account's token; pauses when paged away.
struct VideoPage: View {
    let account: Account
    let photo: Components.Schemas.Photo
    let isCurrent: Bool

    @Environment(AppModel.self) private var model
    @State private var player: AVPlayer?

    var body: some View {
        ZStack {
            if let player {
                VideoPlayer(player: player)
            } else {
                RemoteImage(account: account, photo: photo, variant: .medium, contentMode: .fit)
            }
        }
        .onAppear {
            let request = model.client(for: account).mediaRequest(photoID: photo.id, variant: .video)
            guard let url = request.url else { return }
            // AVPlayer has no public way to add headers; this asset option
            // is the long-standing, widely used one.
            let asset = AVURLAsset(
                url: url,
                options: ["AVURLAssetHTTPHeaderFieldsKey": request.allHTTPHeaderFields ?? [:]]
            )
            player = AVPlayer(playerItem: AVPlayerItem(asset: asset))
        }
        .onChange(of: isCurrent) { _, current in
            if !current { player?.pause() }
        }
        .onDisappear { player?.pause() }
    }
}

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
