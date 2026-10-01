import OwnStepsKit
import SwiftUI

struct TripRoute: Hashable {
    let accountID: UUID
    let tripID: Int
}

/// The trips of every server this device is signed in to. Shows what's
/// cached right away and refreshes in the background.
struct TripListView: View {
    @Environment(AppModel.self) private var model
    @State private var tripsByAccount: [UUID: [Components.Schemas.Trip]] = [:]
    @State private var staleSince: [UUID: Date] = [:]
    @State private var errors: [UUID: String] = [:]
    @State private var accountToSignOut: Account?

    var body: some View {
        NavigationStack {
            List {
                ForEach(model.authorAccounts) { account in
                    Section {
                        if let trips = tripsByAccount[account.id] {
                            if trips.isEmpty {
                                Text("No trips yet.").foregroundStyle(.secondary)
                            }
                            ForEach(trips, id: \.id) { trip in
                                NavigationLink(value: TripRoute(accountID: account.id, tripID: trip.id)) {
                                    TripRow(trip: trip, calendar: model.calendar(for: account))
                                }
                            }
                        } else if let message = errors[account.id] {
                            Text(message).foregroundStyle(.secondary)
                        } else {
                            ProgressView()
                        }
                    } header: {
                        header(for: account)
                    } footer: {
                        if let date = staleSince[account.id] {
                            OfflineNote(fetchedAt: date)
                        }
                    }
                }
            }
            .navigationTitle("Trips")
            .navigationDestination(for: TripRoute.self) { route in
                if let account = model.account(id: route.accountID) {
                    TripView(account: account, tripID: route.tripID)
                }
            }
            .refreshable { await refresh() }
            .task {
                loadCached()
                await refresh()
            }
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

    private func header(for account: Account) -> some View {
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

    private func loadCached() {
        for account in model.authorAccounts where tripsByAccount[account.id] == nil {
            if let cached = try? model.cache.trips(for: account.id) {
                tripsByAccount[account.id] = cached.value
            }
        }
    }

    private func refresh() async {
        for account in model.authorAccounts {
            do {
                let trips = try await model.client(for: account).trips()
                tripsByAccount[account.id] = trips
                try? model.cache.saveTrips(trips, for: account.id)
                staleSince[account.id] = nil
                errors[account.id] = nil
            } catch let error as APIError where error.isUnauthorized {
                // The token was revoked in the web UI – sign in again.
                model.signedOutByServer(account)
            } catch {
                errors[account.id] = ErrorText.message(for: error)
                // Offline with something cached: say how old it is.
                if let cached = try? model.cache.trips(for: account.id) {
                    staleSince[account.id] = cached.fetchedAt
                }
            }
        }
    }
}

struct TripRow: View {
    let trip: Components.Schemas.Trip
    let calendar: TripCalendar

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(trip.title).font(.headline)
            HStack(spacing: 6) {
                if let range = TripDates.range(
                    start: calendar.date(fromCalendarDay: trip.startDate) ?? trip.firstStepAt,
                    end: calendar.date(fromCalendarDay: trip.endDate) ?? trip.lastStepAt,
                    calendar: calendar
                ) {
                    Text(range)
                    Text("·")
                }
                Text("\(trip.stepCount) steps")
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

/// "Offline · as of …" under content that couldn't be refreshed.
struct OfflineNote: View {
    let fetchedAt: Date

    var body: some View {
        Label {
            Text("Offline · as of \(fetchedAt.formatted(.relative(presentation: .named)))")
        } icon: {
            Image(systemName: "wifi.slash")
        }
        .font(.footnote)
    }
}

/// Date range like the web shows it: entered dates win over the steps ([E14]).
enum TripDates {
    static func range(start: Date?, end: Date?, calendar: TripCalendar) -> String? {
        guard let start else { return nil }
        var style = Date.IntervalFormatStyle().day().month(.abbreviated).year()
        style.timeZone = calendar.calendar.timeZone
        guard let end, !calendar.calendar.isDate(start, inSameDayAs: end) else {
            return start.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted, timeZone: calendar.calendar.timeZone))
        }
        return (min(start, end)..<max(start, end)).formatted(style)
    }
}
