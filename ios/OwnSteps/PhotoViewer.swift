import OwnStepsKit
import SwiftUI

/// Fullscreen photos and videos of one step, paged sideways.
struct PhotoViewer: View {
    let account: Account
    let photos: [Components.Schemas.Photo]
    let startIndex: Int

    @Environment(\.dismiss) private var dismiss
    @State private var index = 0
    @State private var captionHeight: CGFloat = 0

    var body: some View {
        // Read before the pages ignore the safe area.
        GeometryReader { geometry in
            pages(insets: geometry.safeAreaInsets)
        }
    }

    private func pages(insets: EdgeInsets) -> some View {
        ZStack {
            Color.black.ignoresSafeArea()

            TabView(selection: $index) {
                ForEach(Array(photos.enumerated()), id: \.element.id) { offset, photo in
                    Group {
                        if photo.mediaType == .video {
                            StoryVideo(account: account, photo: photo, isActive: offset == index)
                                // Clear of the bar on top and the caption below.
                                .padding(.top, insets.top + 60)
                                .padding(.bottom, max(insets.bottom, captionHeight))
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
                if photos.count > 1 {
                    Text("\(index + 1) / \(photos.count)")
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                        .contentTransition(.numericText())
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .glassEffect(.regular, in: .capsule)
                }
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.body.weight(.semibold))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.glass)
                .buttonBorderShape(.circle)
                .accessibilityLabel(Text("Close"))
            }
            .padding(.horizontal)
            .animation(.snappy, value: index)
        }
        .overlay(alignment: .bottom) {
            if let caption = photos[safe: index]?.caption, !caption.isEmpty {
                Text(caption)
                    .font(.callout)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .glassEffect(.regular, in: .rect(cornerRadius: 22))
                    .padding()
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { captionHeight = $0 }
                    .onDisappear { captionHeight = 0 }
            }
        }
        .environment(\.colorScheme, .dark)
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

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
