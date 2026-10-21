# AssetMaster feature request delivery

The PHP endpoint uses Resend. Configure an API key and a verified sender before enabling live submissions. The UI reports unavailable until configuration exists.

Create `/home/ubuntu/migration/private/assetmaster-feedback.json` outside the public document root, readable only by the PHP worker and administrator:

```json
{"apiKey":"YOUR_PRIVATE_RESEND_API_KEY","sender":"AssetMaster <feedback@YOUR_VERIFIED_DOMAIN>","recipient":"YOUR_PRIVATE_DESTINATION"}
```

Never place this configuration in public/, dist/, an Android bundle, VITE variables, or source control. Set ASSETMASTER_FEEDBACK_CONFIG only if a different private path is needed. The directory must be writable by PHP for short-lived rate records. PHP curl and outbound HTTPS are required.

Run `powershell -File scripts/test-feature-request.ps1` with local PHP (or add `-Remote` to use the configured host without deploying), `npm run verify`, and `npm run feedback:check`. Deploy only after a commit. Verify unavailable, validation, rate limits, provider failure, and a controlled successful message; provider acceptance does not prove inbox arrival. Confirm the received message in the destination inbox. No automated check sends email.

The recipient is already saved locally in ignored `.private/assetmaster-feedback.json`. Complete its API key and sender privately; never commit or copy it into the public build.
