import MapKit
import SwiftUI

/// Picking a step's place by hand: move the map under the pin, or search
/// for a place and jump there.
struct LocationPickerView: View {
    let pick: (CLLocationCoordinate2D, String?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var position: MapCameraPosition
    @State private var center: CLLocationCoordinate2D?
    @State private var query = ""
    @State private var results: [MKMapItem] = []
    /// The search result jumped to – its name is used while the pin stays there.
    @State private var chosen: MKMapItem?

    init(initial: CLLocationCoordinate2D?, pick: @escaping (CLLocationCoordinate2D, String?) -> Void) {
        self.pick = pick
        _position = State(initialValue: initial.map {
            .camera(MapCamera(centerCoordinate: $0, distance: 20_000))
        } ?? .userLocation(fallback: .automatic))
        _center = State(initialValue: initial)
    }

    var body: some View {
        NavigationStack {
            Map(position: $position) {
                UserAnnotation()
            }
            .mapStyle(.hybrid)
            .mapControls { MapUserLocationButton() }
            .onMapCameraChange(frequency: .onEnd) { context in
                center = context.region.center
                // Moved away from the search result: no longer its name.
                if let chosen, chosen.location.distance(from: CLLocation(
                    latitude: context.region.center.latitude, longitude: context.region.center.longitude
                )) > 200 {
                    self.chosen = nil
                }
            }
            .overlay {
                Image(systemName: "mappin")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(.red)
                    .shadow(radius: 3)
                    .offset(y: -17)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
            .searchable(text: $query, prompt: Text("Search for a place"))
            .searchSuggestions {
                ForEach(results, id: \.self) { item in
                    Button { go(to: item) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name ?? "")
                            if let area = Self.area(of: item) {
                                Text(area).font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .task(id: query) { await search() }
            .navigationTitle("Choose a place")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(role: .confirm) {
                        if let center { pick(center, chosen?.name) }
                        dismiss()
                    }
                    .disabled(center == nil)
                }
            }
        }
    }

    private func go(to item: MKMapItem) {
        chosen = item
        query = ""
        withAnimation {
            position = .camera(MapCamera(centerCoordinate: item.location.coordinate, distance: 20_000))
        }
    }

    private func search() async {
        let text = query.trimmingCharacters(in: .whitespaces)
        guard text.count >= 2 else {
            results = []
            return
        }
        // Waits for a pause in typing.
        try? await Task.sleep(for: .milliseconds(300))
        guard !Task.isCancelled else { return }
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = text
        request.resultTypes = [.address, .pointOfInterest]
        results = (try? await MKLocalSearch(request: request).start().mapItems) ?? []
    }

    /// "Bergen, Vestland" under a result's name.
    private static func area(of item: MKMapItem) -> String? {
        guard let address = item.addressRepresentations else { return nil }
        let parts = [address.cityName, address.regionName].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }
}
