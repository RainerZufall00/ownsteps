import MapKit
import OwnStepsKit
import SwiftUI

/// The route on Apple's map ([D18]: MapKit, no key, no cost for the host).
/// The line connects the steps in the order they happened.
struct TripMapView: View {
    let account: Account
    let trip: Components.Schemas.TripDetail
    let calendar: TripCalendar
    let openInTimeline: (Int) -> Void

    @State private var selection: Int?
    @State private var position: MapCameraPosition = .automatic

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
        }
        .overlay {
            if steps.isEmpty {
                ContentUnavailableView(
                    "No places yet",
                    systemImage: "map",
                    description: Text("Photos with GPS data put the markers on the map.")
                )
                .background(.regularMaterial)
            }
        }
        .safeAreaInset(edge: .bottom) {
            if let step = steps.first(where: { $0.id == selection }) {
                SelectedStepCard(step: step, trip: trip, calendar: calendar) {
                    openInTimeline(step.id)
                }
                .padding()
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: selection)
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
        .overlay(Circle().stroke(.white, lineWidth: 3))
        .shadow(radius: 4)
        .scaleEffect(selected ? 1.3 : 1)
        .animation(.snappy, value: selected)
    }
}

struct SelectedStepCard: View {
    let step: Components.Schemas.Step
    let trip: Components.Schemas.TripDetail
    let calendar: TripCalendar
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    if let start = calendar.tripStart(startDate: trip.startDate, firstStepAt: trip.steps.first?.occurredAt) {
                        Text("Day \(calendar.tripDay(of: step.occurredAt, start: start))")
                            .font(.caption.bold())
                            .foregroundStyle(.tint)
                    }
                    Text(step.placeName ?? step.occurredAt.formatted(
                        Date.FormatStyle(date: .abbreviated, time: .omitted, timeZone: calendar.calendar.timeZone)
                    ))
                    .font(.headline)
                    Text("Tap to read")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.secondary)
            }
            .padding()
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .glassEffect(in: .rect(cornerRadius: 20))
    }
}
