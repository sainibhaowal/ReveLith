# ReveLith Privacy

Last updated: October 18, 2026

ReveLith opens, edits, and saves documents locally; ordinary file operations do
not upload files to a ReveLith-operated server. Provider-backed AI, search,
image, and media features make network requests when you invoke them. Depending
on the feature, a request may include your prompt, selected text, document
context, or media. The configured provider receives that request and handles it
under its own terms and privacy policy. The provider can also receive your IP
address and standard request metadata as part of the connection.

## Usage analytics

When an official packaged desktop build includes Google Analytics 4
credentials, usage analytics is enabled by default, including on the initial
app launch before the onboarding notice is shown. Source builds and packages
without those credentials do not send these analytics events. Onboarding
explains what is collected and where to turn it off.

You can disable reporting at any time under **Settings → General → Send
anonymous usage statistics**. An explicit opt-out is remembered and stops all
subsequent analytics events.

### Events and parameters

When enabled, the app sends these events:

- `install_first_launch` — marks the first analytics-enabled use of a newly
  assigned pseudonymous `client_id`; used for retention cohorts
- `app_launch` — no event-specific parameter
- `file_open` — `ext`, the file extension such as `docx` or `xlsx`
- `file_new` — `kind`, one of `docx`, `xlsx`, `pptx`, `md`, `html`, or `pdf`
- `login_click` — no event-specific parameter
- `login_success` — no event-specific parameter

Every event includes:

- `app_version`
- `platform`
- `os_version`
- `ui_lang`
- a per-process `session_id` derived from the process start time
- `engagement_time_msec` with the fixed value `100`

When available, the payload also includes `country_id`, the two-letter country
code from the operating system's regional locale. This can differ from the
user's physical location.

The Google Analytics 4 payload also uses a random install UUID as `client_id`,
which is a pseudonymous installation identifier, not an account identifier.
The country code is sent through GA4's country-only `user_location` field; the
app does not send a city or region. Neither identifier is a ReveLith account or
email address.

## Network information

Events are sent to Google Analytics 4 using the Measurement Protocol over
HTTPS. As the HTTPS recipient, Google necessarily sees the connection's public
IP address and transport metadata, and may use them for coarse geolocation and
security or spam-abuse processing. ReveLith does not add an IP address to the
event payload.

## Data not collected by analytics

ReveLith analytics never sends:

- document content
- file names
- file paths
- ReveLith account identity
- email addresses

Analytics credentials are injected only when they are supplied at package
time. Source builds and forks without that packaged metadata install a no-op
tracker and send no usage analytics; all features work the same.

## Website requests

The public download website is served as static files and currently contains no
ReveLith analytics tag. It requests fonts from Google Fonts and links to GitHub
Releases. The hosting VPS receives an IP address and request metadata to serve
the page; whether and how long access logs are retained depends on its server
configuration. Google Fonts and GitHub may also receive an IP address and
standard request metadata when your browser requests their resources or follows
those links.
