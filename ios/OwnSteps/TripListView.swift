import OwnStepsKit
import SwiftUI

struct TripRoute: Hashable {
    let accountID: UUID
    let tripID: Int
    /// Scrolled to on arrival, e.g. from a notification.
    var stepID: Int? = nil
}

/// The trips of every server this device is signed in to. Shows what's
/// cached right away and refreshes in the background.
struct TripListView: View {
    @Environment(AppModel.self) private var model
    @State private var tripsByAccount: [UUID: [Components.Schemas.Trip]] = [:]
    @State private var staleSince: [UUID: Date] = [:]
    @State private var errors: [UUID: String] = [:]
    @State private var accountToSignOut: Account?
    @State private var path = NavigationPath()
    @State private var newTripFor: Account?
    @State private var showingSettings = false
    @State private var following = false
    @State private var accountToUnfollow: Account?

    var body: some View {
        NavigationStack(path: $path) {
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

                if !model.readerAccounts.isEmpty {
                    Section("Following") {
                        ForEach(model.readerAccounts) { account in
                            readerRow(account)
                        }
                    }

                }
            }
            .navigationTitle("Trips")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityLabel(Text("Settings"))
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if model.authorAccounts.count > 1 {
                            Section("New trip") {
                                ForEach(model.authorAccounts) { account in
                                    Button(account.serverURL.host() ?? account.serverName) { newTripFor = account }
                                }
                            }
                        } else if let account = model.authorAccounts.first {
                            Button("New trip", systemImage: "suitcase") { newTripFor = account }
                        }
                        Button("Follow a trip …", systemImage: "person.badge.plus") { following = true }
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel(Text("Add"))
                }
            }
            .sheet(item: $newTripFor) { account in
                TripFormView(account: account, trip: nil, calendar: model.calendar(for: account)) { trip in
                    tripsByAccount[account.id, default: []].insert(trip, at: 0)
                    path.append(TripRoute(accountID: account.id, tripID: trip.id))
                }
            }
            .sheet(isPresented: $showingSettings) { SettingsView() }
            .sheet(isPresented: $following) { FollowView() }
            // An alert, not a second confirmation dialog: SwiftUI shows only one of those per view.
            .alert(
                "Stop following this trip?",
                isPresented: Binding(get: { accountToUnfollow != nil }, set: { if !$0 { accountToUnfollow = nil } }),
                presenting: accountToUnfollow
            ) { account in
                Button("Stop following", role: .destructive) {
                    Task { await model.unfollow(account) }
                }
                Button("Cancel", role: .cancel) {}
            } message: { _ in
                Text("You can follow again with the link.")
            }
            .onChange(of: model.openTrip, initial: true) { _, route in
                guard let route else { return }
                model.openTrip = nil
                path = NavigationPath()
                path.append(route)
                Task { await refresh() }
            }
            .navigationDestination(for: TripRoute.self) { route in
                if let account = model.account(id: route.accountID) {
                    TripView(account: account, tripID: route.tripID, focusStepID: route.stepID)
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

    /// A followed trip: one per reader account, on whichever server.
    @ViewBuilder private func readerRow(_ account: Account) -> some View {
        Group {
            if let trip = tripsByAccount[account.id]?.first {
                NavigationLink(value: TripRoute(accountID: account.id, tripID: trip.id)) {
                    VStack(alignment: .leading, spacing: 2) {
                        TripRow(trip: trip, calendar: model.calendar(for: account))
                        Text(account.serverURL.host() ?? account.serverName)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    Text(account.serverURL.host() ?? account.serverName)
                    Text(errors[account.id] ?? String(localized: "Loading …"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .swipeActions {
            Button("Stop following", role: .destructive) { accountToUnfollow = account }
        }
        .contextMenu {
            Button("Stop following", systemImage: "person.badge.minus", role: .destructive) { accountToUnfollow = account }
        }
    }

    private func loadCached() {
        for account in model.accounts where tripsByAccount[account.id] == nil {
            if let cached = try? model.cache.trips(for: account.id) {
                tripsByAccount[account.id] = cached.value
            }
        }
    }

    private func refresh() async {
        for account in model.accounts {
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
        // Once for all accounts: the Share Extension's trip list.
        model.publishShareTargets()
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
