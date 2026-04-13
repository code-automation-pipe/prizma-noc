1. Sign in to Azure Portal
Go to portal.azure.com → sign in with the Microsoft account that owns the Outlook mailboxes (or any account in the same tenant).

2. Get your Tenant ID
Azure Active Directory → Overview → copy Tenant ID. This is the same for all stores.

3. Register an App
Azure Active Directory → App registrations → New registration

Name: anything, e.g. etsy-monitor
Supported account types: Single tenant
Redirect URI: leave blank
Click Register
Copy the Application (client) ID — that's your clientId.

4. Grant Mail.Read Permission
In your new app → API permissions → Add a permission → Microsoft Graph → Application permissions

Search for Mail.Read → check it → Add permissions
Click Grant admin consent (the blue button) — required for app-level access
5. Create a Client Secret
In your app → Certificates & secrets → New client secret

Description: anything, expiry: 24 months
Click Add → immediately copy the Value (shown only once) — that's your clientSecret