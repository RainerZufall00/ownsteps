import OwnStepsKit
import SwiftUI

struct TripRoute: Hashable {
    let accountID: UUID
    let tripID: Int
    /// Scrolled to on arrival, e.g. from a notification.
    var stepID: Int? = nil

    /// The same trip without the step to scroll to – what a list selects.
    var trip: TripRoute { TripRoute(accountID: accountID, tripID: tripID) }
}

/// The trips of every server this device is signed in to. Shows what's
/// cached right away and refreshes in the background. On the iPhone the
/// trips are large cover cards; with room for it (iPad), a sidebar next to
/// the open trip.
struct TripListView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var tripsByAccount: [UUID: [Components.Schemas.Trip]] = [:]
    @State private var staleSince: [UUID: Date] = [:]
    @State private var errors: [UUID: String] = [:]
    @State private var accountToSignOut: Account?
    /// The open trip on the iPhone …
    @State private var path: [TripRoute] = []
    /// … and in the sidebar. Handed over when the size class changes.
    @State private var selection: TripRoute?
    /// The sidebar starts open; once a trip is chosen, the system decides.
    @State private var columns: NavigationSplitViewVisibility = .all
    @State private var newTripFor: Account?
    @State private var showingSettings = false
    @State private var following = false
    @State private var accountToUnfollow: Account?
    @Namespace private var cardTransition

    private var isSplit: Bool { sizeClass == .regular }

    var body: some View {
        // Read here, not only in the lazy containers' closures – otherwise
        // a first load into an empty list never shows up.
        let lists = Lists(trips: tripsByAccount, errors: errors, staleSince: staleSince)
        Group {
            if isSplit { splitView(lists) } else { stackView(lists) }
        }
        .onChange(of: isSplit) { _, split in
            if split {
                selection = path.last?.trip
            } else {
                path = selection.map { [$0] } ?? []
            }
        }
        .sheet(item: $newTripFor) { account in
            TripFormView(account: account, trip: nil, calendar: model.calendar(for: account)) { trip in
                tripsByAccount[account.id, default: []].insert(trip, at: 0)
                open(TripRoute(accountID: account.id, tripID: trip.id))
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
            Text("This device stops having access to \(host(account)).")
        }
        .onChange(of: model.openTrip, initial: true) { _, route in
            guard let route else { return }
            model.openTrip = nil
            open(route)
            Task { await refresh() }
        }
        .task {
            loadCached()
            await refresh()
        }
    }

    // MARK: iPhone

    private func stackView(_ lists: Lists) -> some View {
        NavigationStack(path: $path) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 32) {
                    ForEach(model.authorAccounts) { account in
                        VStack(alignment: .leading, spacing: 12) {
                            if model.authorAccounts.count > 1 {
                                GroupHeader(title: host(account))
                            }
                            cards(for: account, in: lists)
                        }
                    }
                    if !model.readerAccounts.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            GroupHeader(title: String(localized: "Following"))
                            ForEach(model.readerAccounts) { account in
                                followedCard(account, in: lists)
                            }
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .navigationTitle("Trips")
            .toolbar { toolbar }
            .refreshable { await refresh() }
            .navigationDestination(for: TripRoute.self) { route in
                if let account = model.account(id: route.accountID) {
                    TripView(account: account, tripID: route.tripID, focusStepID: route.stepID)
                        .navigationTransition(.zoom(sourceID: route.trip, in: cardTransition))
                }
            }
        }
    }

    private let gridColumns = [GridItem(.adaptive(minimum: 300), spacing: 16)]

    @ViewBuilder private func cards(for account: Account, in lists: Lists) -> some View {
        if let trips = lists.trips[account.id] {
            if trips.isEmpty {
                ContentUnavailableView {
                    Label("No trips yet", systemImage: "suitcase")
                } description: {
                    Text("Start a trip, then add steps with photos as you go.")
                } actions: {
                    Button("New trip") { newTripFor = account }
                        .buttonStyle(.glassProminent)
                }
            } else {
                LazyVGrid(columns: gridColumns, spacing: 16) {
                    ForEach(trips, id: \.id) { trip in
                        let route = TripRoute(accountID: account.id, tripID: trip.id)
                        NavigationLink(value: route) {
                            TripCard(account: account, trip: trip, calendar: model.calendar(for: account))
                                .matchedTransitionSource(id: route, in: cardTransition)
                        }
                        .buttonStyle(CardButtonStyle())
                    }
                }
            }
        } else if let message = lists.errors[account.id] {
            Text(message)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 60)
        }
        if let date = lists.staleSince[account.id] {
            OfflineNote(fetchedAt: date)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)
        }
    }

    /// A followed trip: one per reader account, on whichever server.
    @ViewBuilder private func followedCard(_ account: Account, in lists: Lists) -> some View {
        if let trip = lists.trips[account.id]?.first {
            let route = TripRoute(accountID: account.id, tripID: trip.id)
            NavigationLink(value: route) {
                TripCard(account: account, trip: trip, calendar: model.calendar(for: account), badge: host(account))
                    .matchedTransitionSource(id: route, in: cardTransition)
            }
            .buttonStyle(CardButtonStyle())
            .contextMenu { unfollowButton(account) }
        } else {
            VStack(alignment: .leading, spacing: 2) {
                Text(host(account)).font(.headline)
                Text(lists.errors[account.id] ?? String(localized: "Loading …"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.fill.tertiary, in: .rect(cornerRadius: 20))
            .contextMenu { unfollowButton(account) }
        }
    }

    // MARK: iPad

    private func splitView(_ lists: Lists) -> some View {
        NavigationSplitView(columnVisibility: $columns) {
            List(selection: $selection) {
                ForEach(model.authorAccounts) { account in
                    Section {
                        sidebarRows(for: account, in: lists)
                    } header: {
                        if model.authorAccounts.count > 1 { Text(host(account)) }
                    } footer: {
                        if let date = lists.staleSince[account.id] { OfflineNote(fetchedAt: date) }
                    }
                }
                if !model.readerAccounts.isEmpty {
                    Section("Following") {
                        ForEach(model.readerAccounts) { account in
                            followedRow(account, in: lists)
                        }
                    }
                }
            }
            .navigationTitle("Trips")
            .toolbar { toolbar }
            .refreshable { await refresh() }
        } detail: {
            NavigationStack {
                if let selection, let account = model.account(id: selection.accountID) {
                    TripView(account: account, tripID: selection.tripID, focusStepID: selection.stepID)
                        .id(selection.trip)
                } else {
                    ContentUnavailableView(
                        "Choose a trip",
                        systemImage: "map",
                        description: Text("Its route and steps appear here.")
                    )
                }
            }
        }
        // In portrait the trip gets the whole width; the sidebar slides over it.
        .navigationSplitViewStyle(.prominentDetail)
        .onChange(of: selection) { _, route in
            if route != nil { columns = .automatic }
        }
    }

    @ViewBuilder private func sidebarRows(for account: Account, in lists: Lists) -> some View {
        if let trips = lists.trips[account.id] {
            if trips.isEmpty {
                Text("No trips yet.").foregroundStyle(.secondary)
            }
            ForEach(trips, id: \.id) { trip in
                TripSidebarRow(account: account, trip: trip, calendar: model.calendar(for: account))
                    .tag(TripRoute(accountID: account.id, tripID: trip.id))
            }
        } else if let message = lists.errors[account.id] {
            Text(message).foregroundStyle(.secondary)
        } else {
            ProgressView()
        }
    }

    @ViewBuilder private func followedRow(_ account: Account, in lists: Lists) -> some View {
        Group {
            if let trip = lists.trips[account.id]?.first {
                TripSidebarRow(account: account, trip: trip, calendar: model.calendar(for: account), caption: host(account))
                    .tag(TripRoute(accountID: account.id, tripID: trip.id))
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    Text(host(account))
                    Text(lists.errors[account.id] ?? String(localized: "Loading …"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .swipeActions {
            Button("Stop following", role: .destructive) { accountToUnfollow = account }
        }
        .contextMenu { unfollowButton(account) }
    }

    // MARK: Shared

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Menu {
                ForEach(model.authorAccounts) { account in
                    Section(host(account)) {
                        Text("\(account.displayName) (\(account.email ?? ""))")
                        Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                            accountToSignOut = account
                        }
                    }
                }
                Section {
                    Button("Settings", systemImage: "gearshape") { showingSettings = true }
                }
            } label: {
                Image(systemName: "person.crop.circle")
            }
            .accessibilityLabel(Text("Account"))
        }
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                if model.authorAccounts.count > 1 {
                    Section("New trip") {
                        ForEach(model.authorAccounts) { account in
                            Button(host(account)) { newTripFor = account }
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

    private func unfollowButton(_ account: Account) -> some View {
        Button("Stop following", systemImage: "person.badge.minus", role: .destructive) { accountToUnfollow = account }
    }

    private func host(_ account: Account) -> String {
        account.serverURL.host() ?? account.serverName
    }

    private func open(_ route: TripRoute) {
        if isSplit {
            selection = route
        } else {
            path = [route]
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

/// What the lists show, handed down from `body`.
private struct Lists {
    let trips: [UUID: [Components.Schemas.Trip]]
    let errors: [UUID: String]
    let staleSince: [UUID: Date]
}

/// Above a group of cards: the server, or "Following".
struct GroupHeader: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.title3.bold())
            .padding(.horizontal, 4)
    }
}
