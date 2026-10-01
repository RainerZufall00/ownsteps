import AuthenticationServices
import Foundation
import OwnStepsKit

/// Turns what went wrong into a sentence for the person holding the phone.
enum ErrorText {
    static func message(for error: any Error) -> String? {
        switch error {
        case let problem as ServerAddress.Problem:
            switch problem {
            case .empty: return String(localized: "Please enter your server's address.")
            case .invalid: return String(localized: "That doesn't look like a web address.")
            case .insecure:
                return String(localized: "The server must use HTTPS. Plain HTTP only works inside your home network.")
            }
        case let api as APIError:
            switch api {
            case .notOwnSteps:
                return String(localized: "No OwnSteps server answers at this address.")
            case .incompatible(let version):
                return String(localized: "This server (version \(version)) doesn't fit this app version. Please update both.")
            case .problem(let code, _):
                return problemMessage(code)
            case .unexpected(let status):
                return String(localized: "The server answered unexpectedly (\(status)).")
            }
        case let callback as OIDCCallback.Problem:
            switch callback {
            case .mismatch: return String(localized: "Sign-in couldn't be completed. Please try again.")
            case .failed(let reason): return oidcMessage(reason)
            }
        case let auth as ASWebAuthenticationSessionError where auth.code == .canceledLogin:
            // Closing the sheet isn't an error worth a message.
            return nil
        case is URLError:
            return String(localized: "The server can't be reached. Check the address and your connection.")
        default:
            return error.localizedDescription
        }
    }

    private static func problemMessage(_ code: String) -> String {
        switch code {
        case "credentials_invalid": String(localized: "Email or password is wrong.")
        case "credentials_missing": String(localized: "Please enter email and password.")
        case "password_login_disabled": String(localized: "Password sign-in is switched off on this server.")
        case "too_many_attempts": String(localized: "Too many attempts. Please wait a moment.")
        case "auth_code_invalid": String(localized: "Sign-in took too long. Please try again.")
        case "not_signed_in": String(localized: "You've been signed out. Please sign in again.")
        default: String(localized: "The server reported an error (\(code)).")
        }
    }

    private static func oidcMessage(_ reason: String) -> String {
        switch reason {
        case "oidc_not_allowed": String(localized: "This account isn't allowed on this server.")
        case "oidc_denied": String(localized: "Sign-in was cancelled.")
        default: String(localized: "Sign-in failed. Please try again.")
        }
    }
}
