import OwnStepsKit
import SwiftUI

/// The trips of every server this device is signed in to.
struct TripListView: View {
    @Environment(AppModel.self) private var model
    @State private var tripsByAccount: [UUID: [Components.Schemas.Trip]] = [:]
    @State private var errors: [UUID: String] = [:]
    @State private var accountToSignOut: Account?

    var body: some View {
        NavigationStack {
            List {
                ForEach(model.authorAccounts) { account in
                    Section {
                        if let message = errors[account.id] {
                            Text(message).foregroundStyle(.secondary)
                        } else if let trips = tripsByAccount[account.id] {
                            if trips.isEmpty {
                                Text("No trips yet.").foregroundStyle(.secondary)
                            }
                            ForEach(trips, id: \.id) { trip in
                                TripRow(trip: trip)
                            }
                        } else {
                            ProgressView()
                        }
                    } header: {
                        HStack {
                            Text(account.serverURL.host() ?? account.serverName)
                            Spacer()
                            Menu {
                                Text("\(account.displayName) (\(account.email ?? ""))")
                                Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                                    accountToSignOut = account
                                }
                            } label: {
                                Image(systemName: "person.crop.circle")
                            }
                            .accessibilityLabel(Text("Account"))
                        }
                    }
                }
            }
            .navigationTitle("Trips")
            .refreshable { await load() }
            .task { await load() }
            .confirmationDialog(
                "Sign out of this server?",
                isPresented: Binding(
                    get: { accountToSignOut != nil },
                    set: { if !$0 { accountToSignOut = nil } }
                ),
                presenting: accountToSignOut
            ) { account in
                Button("Sign out", role: .destructive) {
                    Task { await model.signOut(account) }
                }
            } message: { account in
                Text("This device stops having access to \(account.serverURL.host() ?? account.serverName).")
            }
        }
    }

    private func load() async {
        for account in model.authorAccounts {
            do {
                tripsByAccount[account.id] = try await model.client(for: account).trips()
                errors[account.id] = nil
            } catch let error as APIError where error.isUnauthorized {
                // The token was revoked in the web UI – sign in again.
                model.signedOutByServer(account)
            } catch {
                errors[account.id] = ErrorText.message(for: error)
            }
        }
    }
}

struct TripRow: View {
    let trip: Components.Schemas.Trip

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(trip.title).font(.headline)
            HStack(spacing: 6) {
                if let range = TripDates.range(of: trip) {
                    Text(range)
                }
                Text("·")
                Text("\(trip.stepCount) steps")
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

/// Date range like the web shows it: entered dates win over the steps ([E14]).
enum TripDates {
    static func range(of trip: Components.Schemas.Trip) -> String? {
        let start = trip.startDate.flatMap(calendarDate) ?? trip.firstStepAt
        let end = trip.endDate.flatMap(calendarDate) ?? trip.lastStepAt
        guard let start else { return nil }
        guard let end, end != start else { return start.formatted(date: .abbreviated, time: .omitted) }
        return (start..<max(end, start)).formatted(.interval.day().month(.abbreviated).year())
    }

    /// "2026-07-01" as a local calendar day, not UTC midnight.
    static func calendarDate(_ text: String) -> Date? {
        let parts = text.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }
}
