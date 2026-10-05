import AuthenticationServices
import Foundation
import OwnStepsKit

/// Turns what went wrong into a sentence for the person holding the phone.
enum ErrorText {
    static func message(for error: any Error) -> String? {
        let error = APIError.underlying(error)
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
                return problem(code)
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

    /// The server's problem codes ([D12]) – and the upload queue's own – in
    /// words. `unknown` is for a code this app doesn't know yet.
    static func problem(_ code: String, unknown: ((String) -> String)? = nil) -> String {
        switch code {
        case "credentials_invalid": String(localized: "Email or password is wrong.")
        case "credentials_missing": String(localized: "Please enter email and password.")
        case "password_login_disabled": String(localized: "Password sign-in is switched off on this server.")
        case "too_many_attempts": String(localized: "Too many attempts. Please wait a moment.")
        case "auth_code_invalid": String(localized: "Sign-in took too long. Please try again.")
        case "not_signed_in": String(localized: "You've been signed out. Please sign in again.")
        case "trip_not_found": String(localized: "This trip no longer exists.")
        case "trip_not_shared": String(localized: "This trip isn't shared at the moment.")
        case "share_link_invalid": String(localized: "This link doesn't lead to a shared trip.")
        case "share_password_wrong": String(localized: "The password is wrong.")
        case "comment_name_missing": String(localized: "Please enter your name.")
        case "comment_name_too_long": String(localized: "That name is too long.")
        case "comment_empty": String(localized: "Please write something first.")
        case "comment_too_long": String(localized: "The comment is too long.")
        case "comment_rate_limited": String(localized: "That was a lot of comments. Please wait a moment.")
        case "comment_not_found": String(localized: "This comment no longer exists.")
        case "viewer_not_found": String(localized: "This reader no longer exists.")
        case "step_not_found": String(localized: "The step no longer exists.")
        case "image_too_large": String(localized: "Larger than \(MediaPreparation.maxImageBytes / 1024 / 1024) MB.")
        case "video_too_large": String(localized: "Video larger than \(MediaPreparation.maxVideoBytes / 1024 / 1024) MB.")
        case "unsupported_format": String(localized: "Format not supported.")
        case "media_unprocessable": String(localized: "The server couldn't process it.")
        case "trip_title_too_long": String(localized: "The trip's name is too long.")
        case "trip_summary_too_long": String(localized: "The description is too long.")
        // Set by the upload queue, not the server.
        case "file_missing": String(localized: "The file is gone from the device.")
        case "http_413": String(localized: "Too large for the server or its proxy.")
        default: unknown?(code) ?? String(localized: "The server reported an error (\(code)).")
        }
    }

    /// Why an upload is stuck, from its `lastError`.
    static func uploadProblem(_ code: String) -> String {
        problem(code) { String(localized: "Upload failed (\($0)).") }
    }

    private static func oidcMessage(_ reason: String) -> String {
        switch reason {
        case "oidc_not_allowed": String(localized: "This account isn't allowed on this server.")
        case "oidc_unverified":
            String(localized: "Your sign-in provider hasn't confirmed your email address. Confirm it there and try again.")
        case "oidc_denied": String(localized: "Sign-in was cancelled.")
        default: String(localized: "Sign-in failed. Please try again.")
        }
    }
}
