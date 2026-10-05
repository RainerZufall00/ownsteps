import MapKit
import OwnStepsKit
import SwiftUI

/// The route on Apple's map ([D18]: MapKit, no key, no cost for the host).
/// The line connects the steps in the order they happened. It fills the trip
/// screen; the timeline lies on top of it, and both follow each other: a
/// tapped marker scrolls the timeline, a scrolled timeline moves the map.
struct TripMapView: View {
    let account: Account
    let trip: Components.Schemas.TripDetail
    @Binding var selection: Int?
    @Binding var position: MapCameraPosition

    private var located: [Components.Schemas.Step] {
        trip.steps.filter { $0.lat != nil && $0.lon != nil }
    }

    var body: some View {
        let steps = located
        let coordinates = steps.map { CLLocationCoordinate2D(latitude: $0.lat!, longitude: $0.lon!) }

        Map(position: $position, selection: $selection) {
            if coordinates.count > 1 {
                // A dark casing carries the white line over bright terrain.
                MapPolyline(coordinates: coordinates)
                    .stroke(.black.opacity(0.35), style: StrokeStyle(lineWidth: 7, lineCap: .round, lineJoin: .round))
                MapPolyline(coordinates: coordinates)
                    .stroke(.white, style: StrokeStyle(lineWidth: 3.5, lineCap: .round, lineJoin: .round))
            }
            ForEach(Array(steps.enumerated()), id: \.element.id) { offset, step in
                Annotation(step.placeName ?? "", coordinate: coordinates[offset], anchor: .bottom) {
                    StepMarker(account: account, step: step, number: offset + 1, selected: selection == step.id)
                }
                .tag(step.id)
                .annotationTitles(.hidden)
            }
        }
        // Flat on purpose: with `elevation: .realistic` MapKit drew the route
        // but none of the annotations.
        .mapStyle(.hybrid)
        .mapControls {
            MapUserLocationButton()
            MapCompass()
            MapScaleView()
        }
        .overlay(alignment: .bottom) {
            if steps.isEmpty {
                Label("Photos with GPS data put the markers on the map.", systemImage: "map")
                    .font(.footnote.weight(.medium))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .glassEffect(.regular, in: .capsule)
                    .padding()
            }
        }
        .sensoryFeedback(.selection, trigger: selection) { _, new in new != nil }
    }

    /// The whole route – but never closer than a region, or a trip with one
    /// step would show rooftops.
    static func overview(of trip: Components.Schemas.TripDetail) -> MapCameraPosition {
        let points = trip.steps.compactMap { step -> CLLocationCoordinate2D? in
            guard let lat = step.lat, let lon = step.lon else { return nil }
            return CLLocationCoordinate2D(latitude: lat, longitude: lon)
        }
        guard let first = points.first else { return .automatic }
        var (minLat, maxLat, minLon, maxLon) = (first.latitude, first.latitude, first.longitude, first.longitude)
        for point in points {
            minLat = min(minLat, point.latitude)
            maxLat = max(maxLat, point.latitude)
            minLon = min(minLon, point.longitude)
            maxLon = max(maxLon, point.longitude)
        }
        let center = CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2)
        let span = MKCoordinateSpan(
            latitudeDelta: max((maxLat - minLat) * 1.3, 0.5),
            longitudeDelta: max((maxLon - minLon) * 1.3, 0.5)
        )
        return .region(MKCoordinateRegion(center: center, span: span))
    }

    /// Close enough to see the place, far enough to see where it lies.
    static func camera(for step: Components.Schemas.Step) -> MapCameraPosition? {
        guard let lat = step.lat, let lon = step.lon else { return nil }
        return .camera(MapCamera(centerCoordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon), distance: 60_000))
    }
}

/// Round photo marker with a white ring, like on the web.
struct StepMarker: View {
    let account: Account
    let step: Components.Schemas.Step
    let number: Int
    let selected: Bool

    var body: some View {
        Group {
            if let photo = step.photos.first {
                RemoteImage(account: account, photo: photo, variant: .thumb)
            } else {
                Text("\(number)").font(.footnote.bold()).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(red: 0.16, green: 0.15, blue: 0.13))
            }
        }
        .frame(width: 44, height: 44)
        .clipShape(.circle)
        .overlay(Circle().stroke(selected ? Color.accentColor : .white, lineWidth: 3))
        .shadow(radius: 4)
        .scaleEffect(selected ? 1.35 : 1, anchor: .bottom)
        .animation(.snappy, value: selected)
    }
}
