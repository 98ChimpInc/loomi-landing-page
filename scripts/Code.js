// ============================================
// LOOMI NEWSLETTER & APP STORE WELCOME SYSTEM
// Complete Google Apps Script
// Updated: May 2026 — App Store launch, post-TestFlight
//
// IMPORTANT: After updating this file in the repo, redeploy via clasp
// or the Apps Script editor for live email behaviour to change.
// ============================================

// Live App Store URL — used in the welcome email's "Install Loomi" CTA.
var APP_STORE_LINK = "https://apps.apple.com/app/loomi-sleep-stories-for-kids/id6757821754";
var PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.chimp98.loomi";

// App Store review deep-link — opens straight to the write-review screen.
var APP_STORE_REVIEW_LINK = "https://apps.apple.com/app/loomi-sleep-stories-for-kids/id6757821754?action=write-review";
var PLAY_STORE_REVIEW_LINK = "https://play.google.com/store/apps/details?id=com.chimp98.loomi&showAllReviews=true";

// Tabs this script manages by name. Anything else in the spreadsheet is
// newsletter territory.
var GA_SHEET_NAME = "GA Campaign";
var PILOT_SHEET_NAME = "Pilot Applicants";
var PILOT_CONFIG_SHEET_NAME = "Pilot Config";
var MANAGED_SHEET_NAMES = [GA_SHEET_NAME, PILOT_SHEET_NAME, PILOT_CONFIG_SHEET_NAME];

function isManagedSheetName(name) {
  for (var i = 0; i < MANAGED_SHEET_NAMES.length; i++) {
    if (MANAGED_SHEET_NAMES[i] === name) return true;
  }
  return false;
}

// Crescent-moon emoji 🌙, built from its code point. A literal emoji
// character in the source can get mangled in transit (clasp / GAS file
// handling) and arrive in the subject line as "������"; constructing it
// from the code point keeps the source pure-ASCII and the emoji intact.
var MOON = String.fromCodePoint(0x1F319);

// The pilot path resolves its own tab by name, so the only contamination risk
// left is a newsletter POST arriving while a managed tab happens to be active.
// Resolved by identity rather than position ... a managed tab can sit at index 0.
function getNewsletterSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var active = ss.getActiveSheet();
  if (!isManagedSheetName(active.getName())) return active;

  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (!isManagedSheetName(sheets[i].getName())) return sheets[i];
  }

  return null;
}

// The welcome actions write column H, which is "Can commit" on the pilot tab.
function getActiveNewsletterSheetOrWarn() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (isManagedSheetName(sheet.getName())) {
    SpreadsheetApp.getUi().alert(
      'Open the newsletter signups tab first ... this action writes to columns the "' +
      sheet.getName() + '" tab uses for something else.'
    );
    return null;
  }
  return sheet;
}

// Handle form submissions from landing page
function doPost(e) {
  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    var data = JSON.parse(e.postData.contents);

    // A missing "form" field is the newsletter form on index.html.
    if (data.form === 'pilot') {
      output.setContent(JSON.stringify(handlePilotSubmission(data)));
      return output;
    }

    var sheet = getNewsletterSheet();
    if (!sheet) {
      output.setContent(JSON.stringify({
        'result': 'error',
        'message': 'We could not save that just now ... please try again shortly.'
      }));
      return output;
    }

    // Honeypot check - if filled, it's a bot
    if (data.website) {
      output.setContent(JSON.stringify({
        'result': 'error',
        'message': 'Bot detected'
      }));
      return output;
    }

    var timestamp = new Date();

    // Append row with data
    sheet.appendRow([
      timestamp,
      data.parent_name,
      data.email,
      data.child_age,
      data.language,
      data.source || 'landing_page'
    ]);

    // Send email notification to owner
    sendEmailNotification(data.parent_name, data.email);

    // Send welcome email — App Store install CTA, no TestFlight onboarding
    sendUserConfirmation(data.parent_name, data.email);

    output.setContent(JSON.stringify({
      'result': 'success',
      'message': 'Thanks for subscribing!'
    }));
    return output;

  } catch (error) {
    output.setContent(JSON.stringify({
      'result': 'error',
      'message': error.toString()
    }));
    return output;
  }
}

// Handle GET requests (for testing), plus the pilot page's config fetch.
function doGet(e) {
  if (e && e.parameter && e.parameter.config === 'pilot') {
    var output = ContentService.createTextOutput();
    output.setMimeType(ContentService.MimeType.JSON);
    try {
      output.setContent(JSON.stringify({
        'result': 'success',
        'cohortStartDate': readPilotConfig().cohortStartDate
      }));
    } catch (error) {
      output.setContent(JSON.stringify({
        'result': 'error',
        'cohortStartDate': ''
      }));
    }
    return output;
  }

  return ContentService.createTextOutput("Loomi Newsletter API is running!");
}

// Send notification email to team about new signup
function sendEmailNotification(parentName, email) {
  var recipient = "hello@loomi.kids";
  var subject = "New Loomi Newsletter Signup!";
  var body = "New signup:\n\n" +
             "Parent: " + parentName + "\n" +
             "Email: " + email + "\n\n" +
             "View all signups: " + SpreadsheetApp.getActiveSpreadsheet().getUrl();

  GmailApp.sendEmail(recipient, subject, body, {
    from: "hello@loomi.kids",
    name: "Loomi Newsletter"
  });
}

// ============================================
// EMAIL: Welcome to Loomi (App Store install)
// Sent automatically on newsletter signup
// ============================================
function sendUserConfirmation(parentName, email) {
  var subject = "Welcome to Loomi";

  var htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600&display=swap" rel="stylesheet">
    </head>
    <body style="margin: 0; padding: 0; background-color: #0a0e1f; font-family: 'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0e1f;">
        <tr>
          <td align="center" style="padding: 40px 20px; background: url('https://www.loomi.kids/assets/starfield-tile-transparent.png') repeat, linear-gradient(to bottom, #0a0e1f 0%, #141b2d 50%, #1a2332 100%); background-color: #0a0e1f;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background: rgba(10, 14, 31, 0.65); border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.08);">

              <!-- Logo Header -->
              <tr>
                <td align="center" style="padding: 40px 40px 30px;">
                  <img src="https://www.loomi.kids/assets/loomi-logo-header.png?v=2" alt="Loomi" width="120" style="display: block;">
                </td>
              </tr>

              <!-- Main Content -->
              <tr>
                <td style="padding: 0 40px;">
                  <h1 style="color: #ffffff; font-size: 28px; font-weight: 600; margin: 0 0 20px; text-align: center;">
                    Hi ${parentName}!
                  </h1>

                  <p style="color: #a5b4fc; font-size: 18px; line-height: 1.6; margin: 0 0 25px; text-align: center;">
                    Thanks for subscribing to Loomi &#127769;<br>
                    We'll send you product updates and the occasional bedtime drop.
                  </p>

                  <p style="color: #a5b4fc; font-size: 16px; line-height: 1.6; margin: 0 0 25px; text-align: center;">
                    Loomi is now on the App Store and Google Play. Tap below to install.
                  </p>

                  <!-- App Store CTA -->
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="center" style="padding: 8px 0 16px;">
                        <a href="${APP_STORE_LINK}" style="display: inline-block; line-height: 0; text-decoration: none; margin: 0 6px;">
                          <img src="https://www.loomi.kids/assets/app-store-badge.svg" alt="Download on the App Store" height="56" style="height: 56px; width: auto; display: inline-block;">
                        </a>
                        <a href="${PLAY_STORE_LINK}" style="display: inline-block; line-height: 0; text-decoration: none; margin: 0 6px;">
                          <img src="https://www.loomi.kids/assets/google-play-badge.svg" alt="Get it on Google Play" height="56" style="height: 56px; width: auto; display: inline-block;">
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Sign-off -->
              <tr>
                <td style="padding: 20px 40px 40px;">
                  <p style="color: #a5b4fc; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                    Once you've installed Loomi, sign in with Apple or Google, set up your child's profile, and pick your first story. If anything feels confusing, just reply to this email &#8212; we'll personally help you through it.
                  </p>

                  <p style="color: #ffffff; font-size: 18px; margin: 0;">
                    Sweet dreams,<br>
                    <span style="color: #f4a460;">The Loomi Team</span>
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding: 30px 40px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="center" style="padding-bottom: 12px;">
                        <img src="https://www.loomi.kids/apple-touch-icon.png?v=2" alt="Loomi" width="24" height="24" style="display: inline-block; vertical-align: middle; border-radius: 6px;">
                        <span style="color: #8b9dc3; font-size: 13px; margin-left: 8px; vertical-align: middle;">Loomi: The art &amp; science of calm &amp; confident kids</span>
                      </td>
                    </tr>
                    <tr>
                      <td align="center">
                        <p style="color: #6b7a99; font-size: 12px; margin: 0; line-height: 1.5;">
                          &#169; 2026 Loomi. Built with &#10084;&#65039; by 3 brothers and dads for parents seeking peaceful bedtimes.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-top: 12px;">
                        <a href="https://www.loomi.kids" style="color: #8b9dc3; font-size: 12px; text-decoration: none;">www.loomi.kids</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  var plainBody = "Hi " + parentName + "!\n\n" +
                  "Thanks for subscribing to Loomi 🌙 We'll send you product updates and the occasional bedtime drop.\n\n" +
                  "Loomi is now on the App Store and Google Play. Tap below to install:\n" +
                  APP_STORE_LINK + "\n\n" +
                  "Once you've installed Loomi, sign in with Apple or Google, set up your child's profile, and pick your first story. If anything feels confusing, just reply to this email — we'll personally help you through it.\n\n" +
                  "Sweet dreams,\n" +
                  "The Loomi Team\n\n" +
                  "---\n" +
                  "Loomi: The art & science of calm & confident kids\n" +
                  "© 2026 Loomi. Built with love by 3 brothers and dads for parents seeking peaceful bedtimes.\n" +
                  "www.loomi.kids";

  GmailApp.sendEmail(email, subject, plainBody, {
    htmlBody: htmlBody,
    from: "hello@loomi.kids",
    name: "Loomi"
  });
}


// ============================================
// GA LAUNCH CAMPAIGN — thank-you + offer code to early testers
//
// Two emails, sent from a dedicated "GA Campaign" sheet tab:
//   1. GA announcement — thanks the tester, gifts a one-year Loomi
//      Premium offer code, and asks (does not require) a review.
//   2. Review nudge — a gentle reminder a few days later.
//
// Sheet column layout (tab named per GA_SHEET_NAME):
//   A Name | B Email | C Offer Code | D GA Email Sent | E Review Nudge Sent
//
// The offer code is read per-row from column C. Paste codes harvested
// from App Store Connect there, one per tester. Rows with a blank code
// are skipped — a gift email with a missing code never goes out.
// ============================================

// Shared HTML shell for branded Loomi emails. Pass in the inner <tr>...</tr>
// content; it gets wrapped with the navy starfield background, logo header
// and footer. (The older sendUserConfirmation predates this helper and keeps
// its own inline shell — left as-is to avoid touching the live form path.)
function loomiEmailShell(innerHtml) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600&display=swap" rel="stylesheet">
    </head>
    <body style="margin: 0; padding: 0; background-color: #0a0e1f; font-family: 'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0e1f;">
        <tr>
          <td align="center" style="padding: 40px 20px; background: url('https://www.loomi.kids/assets/starfield-tile-transparent.png') repeat, linear-gradient(to bottom, #0a0e1f 0%, #141b2d 50%, #1a2332 100%); background-color: #0a0e1f;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background: rgba(10, 14, 31, 0.65); border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.08);">

              <!-- Logo Header -->
              <tr>
                <td align="center" style="padding: 40px 40px 30px;">
                  <img src="https://www.loomi.kids/assets/loomi-logo-header.png?v=2" alt="Loomi" width="120" style="display: block;">
                </td>
              </tr>

              ${innerHtml}

              <!-- Footer -->
              <tr>
                <td style="padding: 30px 40px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="center" style="padding-bottom: 12px;">
                        <img src="https://www.loomi.kids/apple-touch-icon.png?v=2" alt="Loomi" width="24" height="24" style="display: inline-block; vertical-align: middle; border-radius: 6px;">
                        <span style="color: #8b9dc3; font-size: 13px; margin-left: 8px; vertical-align: middle;">Bedtime stories that build children's confidence from the inside out.</span>
                      </td>
                    </tr>
                    <tr>
                      <td align="center">
                        <p style="color: #6b7a99; font-size: 12px; margin: 0; line-height: 1.5;">
                          &#169; 2026 Loomi. Built with &#10084;&#65039; by 3 brothers and dads for parents seeking peaceful bedtimes.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-top: 12px;">
                        <a href="https://www.loomi.kids" style="color: #8b9dc3; font-size: 12px; text-decoration: none;">www.loomi.kids</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

// First-name helper — "Shahin Zangenehpour" -> "Shahin", blank -> "there".
function firstNameOf(name) {
  var n = (name || '').toString().trim();
  return n ? n.split(/\s+/)[0] : 'there';
}

// Email clients need a non-ASCII subject wrapped as an RFC 2047 "encoded-word".
// GmailApp does not reliably encode emoji in the subject header itself — an
// astral-plane character like 🌙 arrives mangled as "������" — so we pre-encode
// the subject as =?UTF-8?B?<base64 of correct UTF-8 bytes>?= and let the
// receiving client decode it. Utilities.newBlob produces correct UTF-8 (4 bytes
// for the moon), unlike GmailApp's internal subject encoder. The HTML body is
// unaffected; this is only for the Subject header.
function mimeEncodeSubject(subject) {
  var utf8Bytes = Utilities.newBlob(subject).getBytes();
  return "=?UTF-8?B?" + Utilities.base64Encode(utf8Bytes) + "?=";
}

// ============================================
// EMAIL 1: GA announcement + one-year offer code
// ============================================
function sendGAAnnouncement(name, email, offerCode) {
  var firstName = firstNameOf(name);
  var subject = mimeEncodeSubject("A thank-you gift for our first families " + MOON);

  var inner = `
    <tr>
      <td style="padding: 0 40px;">
        <h1 style="color: #ffffff; font-size: 25px; font-weight: 600; margin: 0 0 22px; text-align: center; line-height: 1.35;">
          Hi ${firstName}, and a sleepy hello to your little one too! &#127769;
        </h1>

        <p style="color: #a5b4fc; font-size: 16px; line-height: 1.7; margin: 0 0 22px;">
          You're one of the very first families to tuck in with Loomi, and we can't thank you enough. Every bit of feedback you shared went straight into the heart of this app. You didn't just test Loomi ... you helped us build it. &#128156;
        </p>

        <p style="color: #a5b4fc; font-size: 16px; line-height: 1.7; margin: 0 0 26px;">
          Today, Loomi is officially on the App Store and Google Play.
        </p>

        <!-- A little wish -->
        <h2 style="color: #ffffff; font-size: 19px; font-weight: 600; margin: 0 0 12px;">
          A little wish from our team
        </h2>
        <p style="color: #a5b4fc; font-size: 16px; line-height: 1.7; margin: 0 0 14px;">
          If bedtime with Loomi has brought a few peaceful moments to your home, an honest review on the App Store or Google Play would mean the world. A sentence or two is plenty. What helps most:
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 18px;">
          <tr><td style="color: #a5b4fc; font-size: 15px; line-height: 1.8; padding-left: 6px;">
            &#8226;&nbsp; Your child's age and their favourite story or culture<br>
            &#8226;&nbsp; A sweet bedtime moment you noticed<br>
            &#8226;&nbsp; What feels different about Loomi
          </td></tr>
        </table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 30px;">
          <tr>
            <td align="center">
              <a href="${APP_STORE_REVIEW_LINK}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #8b5cf6 100%); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 30px;">Leave a review on the App Store</a>
              <a href="${PLAY_STORE_REVIEW_LINK}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #8b5cf6 100%); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 30px; margin-top: 10px;">Leave a review on Google Play</a>
            </td>
          </tr>
        </table>

        <!-- A thank-you gift (given unconditionally — not tied to the review) -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 26px;">
          <tr>
            <td style="background: rgba(244, 164, 96, 0.1); border: 1px solid rgba(244, 164, 96, 0.3); border-radius: 16px; padding: 26px; text-align: center;">
              <p style="color: #ffffff; font-size: 19px; font-weight: 600; margin: 0 0 6px;">
                &#127873; A thank-you gift
              </p>
              <p style="color: #a5b4fc; font-size: 15px; line-height: 1.6; margin: 0 0 18px;">
                One full year of Loomi Premium, on us.
              </p>
              <div style="background: #0a0e1f; border: 1px dashed rgba(244, 164, 96, 0.55); border-radius: 10px; padding: 14px 22px; display: inline-block;">
                <span style="color: #f4a460; font-size: 22px; font-weight: 600; letter-spacing: 2px; font-family: 'Courier New', Courier, monospace;">${offerCode}</span>
              </div>
              <p style="color: #8b9dc3; font-size: 13px; line-height: 1.6; margin: 16px 0 0;">
                Redeem in the app: Settings &#8594; Redeem Code.<br>
                Unlocks all 25 stories, every age band, and our 30-minute deep sleep editions.
              </p>
            </td>
          </tr>
        </table>

        <p style="color: #a5b4fc; font-size: 16px; line-height: 1.7; margin: 0 0 22px;">
          Sweet dreams to your whole family. Here's to many more snuggly bedtimes together. &#127775;
        </p>

        <p style="color: #ffffff; font-size: 16px; margin: 0 0 4px;">
          With love,<br>
          <span style="color: #f4a460;">Shawn &amp; the Loomi Team</span>
        </p>
      </td>
    </tr>
  `;

  var plainBody =
    "Hi " + firstName + ", and a sleepy hello to your little one too!\n\n" +
    "You're one of the very first families to tuck in with Loomi, and we can't thank you enough. Every bit of feedback you shared went straight into the heart of this app. You didn't just test Loomi ... you helped us build it.\n\n" +
    "Today, Loomi is officially on the App Store and Google Play.\n\n" +
    "A LITTLE WISH FROM OUR TEAM\n" +
    "If bedtime with Loomi has brought a few peaceful moments to your home, an honest review on the App Store or Google Play would mean the world. A sentence or two is plenty. What helps most:\n" +
    " - Your child's age and their favourite story or culture\n" +
    " - A sweet bedtime moment you noticed\n" +
    " - What feels different about Loomi\n" +
    "Leave a review on the App Store: " + APP_STORE_REVIEW_LINK + "\n" +
        "Leave a review on Google Play: " + PLAY_STORE_REVIEW_LINK + "\n\n" +
    "A THANK-YOU GIFT\n" +
    "One full year of Loomi Premium, on us.\n\n" +
    "    " + offerCode + "\n\n" +
    "Redeem in the app: Settings -> Redeem Code. Unlocks all 25 stories, every age band, and our 30-minute deep sleep editions.\n\n" +
    "Sweet dreams to your whole family. Here's to many more snuggly bedtimes together.\n\n" +
    "With love,\n" +
    "Shawn & the Loomi Team\n" +
    "www.loomi.kids";

  GmailApp.sendEmail(email, subject, plainBody, {
    htmlBody: loomiEmailShell(inner),
    from: "hello@loomi.kids",
    name: "Loomi"
  });
}

// ============================================
// EMAIL 2: gentle review nudge (sent a few days after email 1)
// ============================================
function sendReviewNudge(name, email) {
  var firstName = firstNameOf(name);
  var subject = mimeEncodeSubject("A quick favour, if you have a moment " + MOON);

  var inner = `
    <tr>
      <td style="padding: 0 40px;">
        <h1 style="color: #ffffff; font-size: 25px; font-weight: 600; margin: 0 0 22px; text-align: center; line-height: 1.35;">
          Hi ${firstName} &#127769;
        </h1>

        <p style="color: #a5b4fc; font-size: 16px; line-height: 1.7; margin: 0 0 22px;">
          We hope your free year of Loomi Premium is already making bedtimes a little softer. If you haven't redeemed it yet, it's waiting for you in the app: Settings &#8594; Redeem Code.
        </p>

        <p style="color: #a5b4fc; font-size: 16px; line-height: 1.7; margin: 0 0 22px;">
          One last little favour: if Loomi has earned a place in your bedtime routine, an honest review on the App Store or Google Play helps other tired parents find us. A sentence or two is all it takes ... and it genuinely makes a difference for a small team like ours.
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 8px 0 28px;">
          <tr>
            <td align="center">
              <a href="${APP_STORE_REVIEW_LINK}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #8b5cf6 100%); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 30px;">Leave a review on the App Store</a>
              <a href="${PLAY_STORE_REVIEW_LINK}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #8b5cf6 100%); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 30px; margin-top: 10px;">Leave a review on Google Play</a>
            </td>
          </tr>
        </table>

        <p style="color: #a5b4fc; font-size: 16px; line-height: 1.7; margin: 0 0 22px;">
          Either way, thank you for being one of the first families to believe in Loomi. It means everything.
        </p>

        <p style="color: #ffffff; font-size: 16px; margin: 0 0 4px;">
          Sweet dreams,<br>
          <span style="color: #f4a460;">Shawn &amp; the Loomi Team</span>
        </p>
      </td>
    </tr>
  `;

  var plainBody =
    "Hi " + firstName + "!\n\n" +
    "We hope your free year of Loomi Premium is already making bedtimes a little softer. If you haven't redeemed it yet, it's waiting for you in the app: Settings -> Redeem Code.\n\n" +
    "One last little favour: if Loomi has earned a place in your bedtime routine, an honest review on the App Store or Google Play helps other tired parents find us. A sentence or two is all it takes ... and it genuinely makes a difference for a small team like ours.\n\n" +
    "Leave a review on the App Store: " + APP_STORE_REVIEW_LINK + "\n" +
        "Leave a review on Google Play: " + PLAY_STORE_REVIEW_LINK + "\n\n" +
    "Either way, thank you for being one of the first families to believe in Loomi. It means everything.\n\n" +
    "Sweet dreams,\n" +
    "Shawn & the Loomi Team\n" +
    "www.loomi.kids";

  GmailApp.sendEmail(email, subject, plainBody, {
    htmlBody: loomiEmailShell(inner),
    from: "hello@loomi.kids",
    name: "Loomi"
  });
}

// ============================================
// GA CAMPAIGN — sheet setup + batch senders
// ============================================

// One-time setup: create the "GA Campaign" tab with the expected headers.
function setupGACampaignSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  if (ss.getSheetByName(GA_SHEET_NAME)) {
    ui.alert('The "' + GA_SHEET_NAME + '" tab already exists — nothing to do.');
    return;
  }
  var sheet = ss.insertSheet(GA_SHEET_NAME, ss.getNumSheets());
  var headers = ['Name', 'Email', 'Offer Code', 'GA Email Sent', 'Review Nudge Sent'];
  sheet.getRange(1, 1, 1, headers.length)
       .setValues([headers])
       .setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 240);
  sheet.setColumnWidth(3, 200);
  sheet.setColumnWidth(4, 160);
  sheet.setColumnWidth(5, 160);
  ui.alert('Created the "' + GA_SHEET_NAME + '" tab.\n\n' +
           'Fill columns A-C (Name, Email, Offer Code), select the rows, ' +
           'then run "Send GA Announcement to Selected Rows".');
}

// Guard: returns the GA Campaign sheet only if it is the active sheet.
function getActiveGASheetOrWarn() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getName() !== GA_SHEET_NAME) {
    SpreadsheetApp.getUi().alert(
      'Open the "' + GA_SHEET_NAME + '" tab first, then select the rows to send to.'
    );
    return null;
  }
  return sheet;
}

// Send the GA announcement (email 1) to the currently selected rows.
function sendGAAnnouncementToSelectedRows() {
  var sheet = getActiveGASheetOrWarn();
  if (!sheet) return;

  var selection = sheet.getActiveRange();
  var startRow = selection.getRow();
  var numRows = selection.getNumRows();
  if (startRow === 1) { startRow = 2; numRows = numRows - 1; }  // skip header
  if (numRows < 1) {
    SpreadsheetApp.getUi().alert('Select one or more data rows first.');
    return;
  }

  var sent = 0, skippedSent = 0, skippedNoCode = 0, skippedNoEmail = 0;

  for (var i = 0; i < numRows; i++) {
    var row = startRow + i;
    var name      = sheet.getRange(row, 1).getValue();  // A
    var email     = sheet.getRange(row, 2).getValue();  // B
    var offerCode = sheet.getRange(row, 3).getValue();  // C
    var gaSent    = sheet.getRange(row, 4).getValue();  // D

    if (!email)                  { skippedNoEmail++; continue; }
    if (!offerCode)              { skippedNoCode++;  continue; }  // never send a blank-code gift
    if (gaSent)                  { skippedSent++;    continue; }  // already sent

    sendGAAnnouncement(name, email, offerCode.toString().trim());
    sheet.getRange(row, 4).setValue(new Date());
    sent++;
    Utilities.sleep(600);
  }

  SpreadsheetApp.getUi().alert(
    '✅ GA Announcement\n\n' +
    'Sent: ' + sent + '\n' +
    'Skipped — already sent: ' + skippedSent + '\n' +
    'Skipped — missing offer code: ' + skippedNoCode + '\n' +
    'Skipped — missing email: ' + skippedNoEmail
  );
}

// Send the review nudge (email 2) to the currently selected rows.
// Only goes to rows that already received the GA announcement.
function sendReviewNudgeToSelectedRows() {
  var sheet = getActiveGASheetOrWarn();
  if (!sheet) return;

  var selection = sheet.getActiveRange();
  var startRow = selection.getRow();
  var numRows = selection.getNumRows();
  if (startRow === 1) { startRow = 2; numRows = numRows - 1; }
  if (numRows < 1) {
    SpreadsheetApp.getUi().alert('Select one or more data rows first.');
    return;
  }

  var sent = 0, skippedSent = 0, skippedNoGA = 0, skippedNoEmail = 0;

  for (var i = 0; i < numRows; i++) {
    var row = startRow + i;
    var name       = sheet.getRange(row, 1).getValue();  // A
    var email      = sheet.getRange(row, 2).getValue();  // B
    var gaSent     = sheet.getRange(row, 4).getValue();  // D
    var nudgeSent  = sheet.getRange(row, 5).getValue();  // E

    if (!email)     { skippedNoEmail++; continue; }
    if (!gaSent)    { skippedNoGA++;    continue; }  // don't nudge someone who never got email 1
    if (nudgeSent)  { skippedSent++;    continue; }

    sendReviewNudge(name, email);
    sheet.getRange(row, 5).setValue(new Date());
    sent++;
    Utilities.sleep(600);
  }

  SpreadsheetApp.getUi().alert(
    '✅ Review Nudge\n\n' +
    'Sent: ' + sent + '\n' +
    'Skipped — already nudged: ' + skippedSent + '\n' +
    'Skipped — never got the GA email: ' + skippedNoGA + '\n' +
    'Skipped — missing email: ' + skippedNoEmail
  );
}

// Preview: sends both campaign emails to the address below so the team
// can eyeball them before any real send. Uses a sample offer code.
// Change GA_PREVIEW_EMAIL to whoever should receive the preview.
var GA_PREVIEW_EMAIL = "hello@loomi.kids";
function testGACampaignEmails() {
  sendGAAnnouncement("Test Parent", GA_PREVIEW_EMAIL, "LOOMI-FAMILY-2026");
  Utilities.sleep(800);
  sendReviewNudge("Test Parent", GA_PREVIEW_EMAIL);
  SpreadsheetApp.getUi().alert('Sent both campaign emails to ' + GA_PREVIEW_EMAIL + ' for preview.');
}


// ============================================
// PILOT PROGRAMME ... intake, review, invitation codes
//
// A second form (pilot.html) posts to the same deployment with
// {"form": "pilot", ...}. Applicants land on their own tab; the operator
// reviews them, sets Status to "approved", issues an invitation code, then
// sends the approval email.
//
// Sheet column layout (tab named per PILOT_SHEET_NAME):
//   A Timestamp | B Parent name | C Email | D Child age (months) | E Age band
//   F Device | G Timezone | H Can commit | I Challenge | J Themes
//   K Audience segment | L Status | M Invitation code | N Approval email sent
//   O Notes
//
// Statuses: new, waitlisted, approved, ineligible, withdrawn.
// ============================================

var PILOT_CHALLENGE_TAGS = {
  'resistance':   'sleep',
  'settling':     'sleep',
  'night_waking': 'sleep',
  'separation':   'sleep',
  'worries':      'developmental',
  'confidence':   'developmental',
  'siblings':     'developmental',
  'other':        'neutral'
};

// Courage is tagged sleep: at bedtime a courage story is about the dark, or
// monsters, or sleeping alone, which is a settling problem rather than a
// developmental aim.
var PILOT_THEME_TAGS = {
  'confidence':       'developmental',
  'calm':             'sleep',
  'courage':          'sleep',
  'kindness':         'developmental',
  'separation':       'sleep',
  'sibling_jealousy': 'developmental',
  'school_anxiety':   'developmental'
};

// 24 to 71 months inclusive ... a child from their second birthday to their sixth.
// A band labelled "N-(N+1)" spans the Nth to the (N+1)th birthday ... an N-year-old.
function pilotAgeBand(childAgeMonths) {
  var months = parseInt(childAgeMonths, 10);
  if (isNaN(months)) return null;
  if (months >= 24 && months <= 35) return '2-3';
  if (months >= 36 && months <= 47) return '3-4';
  if (months >= 48 && months <= 59) return '4-5';
  if (months >= 60 && months <= 71) return '5-6';
  return null;
}

// Sleep-leaning signals score -1, developmental +1, neutral 0. A zero score
// resolves to sleep and raises a tie flag so the reviewer can check it.
function derivePilotAudience(challenge, themes) {
  var score = 0;
  var challengeTag = PILOT_CHALLENGE_TAGS[challenge];
  if (challengeTag === 'sleep')         { score -= 1; }
  if (challengeTag === 'developmental') { score += 1; }

  for (var i = 0; i < themes.length; i++) {
    var themeTag = PILOT_THEME_TAGS[themes[i]];
    if (themeTag === 'sleep')         { score -= 1; }
    if (themeTag === 'developmental') { score += 1; }
  }

  return {
    'segment': score > 0 ? 'developmental' : 'sleep',
    'tie': score === 0
  };
}

// Create the pilot tabs if they are missing. Returns the names created.
// They go at the end so they never shift the tabs already in the spreadsheet.
function ensurePilotSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var created = [];

  if (!ss.getSheetByName(PILOT_SHEET_NAME)) {
    var sheet = ss.insertSheet(PILOT_SHEET_NAME, ss.getNumSheets());
    var headers = ['Timestamp', 'Parent name', 'Email', 'Child age (months)', 'Age band',
                   'Device', 'Timezone', 'Can commit', 'Challenge', 'Themes',
                   'Audience segment', 'Status', 'Invitation code', 'Approval email sent', 'Notes'];
    var widths = [160, 180, 240, 150, 100, 100, 170, 110, 150, 260, 150, 110, 150, 170, 320];
    sheet.getRange(1, 1, 1, headers.length)
         .setValues([headers])
         .setFontWeight('bold');
    sheet.setFrozenRows(1);
    for (var i = 0; i < widths.length; i++) {
      sheet.setColumnWidth(i + 1, widths[i]);
    }
    created.push(PILOT_SHEET_NAME);
  }

  if (!ss.getSheetByName(PILOT_CONFIG_SHEET_NAME)) {
    var config = ss.insertSheet(PILOT_CONFIG_SHEET_NAME, ss.getNumSheets());
    config.getRange(1, 1, 1, 2)
          .setValues([['Key', 'Value']])
          .setFontWeight('bold');
    config.setFrozenRows(1);
    config.setColumnWidth(1, 200);
    config.setColumnWidth(2, 160);
    config.getRange(2, 2).setNumberFormat('@');
    config.getRange(2, 1, 2, 2).setValues([
      ['Cohort start date', "2026-10-05"],
      ['Capacity', 40]
    ]);
    created.push(PILOT_CONFIG_SHEET_NAME);
  }

  return created;
}

// One-time setup from the menu: both pilot tabs, seeded and formatted.
function setupPilotApplicantsSheet() {
  var ui = SpreadsheetApp.getUi();
  var created = ensurePilotSheets();
  if (!created.length) {
    ui.alert('The "' + PILOT_SHEET_NAME + '" and "' + PILOT_CONFIG_SHEET_NAME + '" tabs already exist ... nothing to do.');
    return;
  }
  ui.alert('Created: ' + created.join(', ') + '.\n\n' +
           'Set the cohort start date and capacity on the "' + PILOT_CONFIG_SHEET_NAME + '" tab. ' +
           'Applications arrive on "' + PILOT_SHEET_NAME + '" on their own.');
}

// Cohort start date and capacity live in the sheet, never in this file, so
// the operator can move either without a redeploy. Reads only ... the public
// config GET reaches this, and a GET must never write to the spreadsheet.
function readPilotConfig() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PILOT_CONFIG_SHEET_NAME);
  var config = { 'cohortStartDate': '', 'capacity': 0 };
  if (!sheet) return config;

  var lastRow = sheet.getLastRow();

  for (var row = 2; row <= lastRow; row++) {
    var key   = (sheet.getRange(row, 1).getValue() || '').toString().trim().toLowerCase();  // A
    var value = sheet.getRange(row, 2).getValue();                                          // B
    if (key === 'cohort start date') { config.cohortStartDate = pilotDateText(value); }
    if (key === 'capacity')          { config.capacity = parseInt(value, 10) || 0; }
  }

  return config;
}

// The config cell is forced text, but a hand-edit can turn it into a real date.
// Either way the applicant sees one format. A Sheets date cell is anchored to
// the spreadsheet's timezone, so that is the zone both branches work in.
function pilotDateText(value) {
  var timeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var date = (value instanceof Date) ? value : pilotParseDate((value || '').toString().trim(), timeZone);
  if (!date) return '';
  return Utilities.formatDate(date, timeZone, "d MMMM yyyy");
}

// ISO is split by hand: new Date("2026-10-05") is parsed as UTC and lands on
// the previous day west of Greenwich.
function pilotParseDate(text, timeZone) {
  if (!text) return null;

  var iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) {
    var month = ('0' + parseInt(iso[2], 10)).slice(-2);
    var day = ('0' + parseInt(iso[3], 10)).slice(-2);
    var offset = Utilities.formatDate(
      new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10), 12, 0, 0),
      timeZone,
      "Z"
    );
    var anchored = new Date(iso[1] + "-" + month + "-" + day + "T12:00:00" +
                            offset.slice(0, 3) + ":" + offset.slice(3));
    return isNaN(anchored.getTime()) ? null : anchored;
  }

  var parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// Whole numbers only. Returns null for anything else, including a missing field.
function pilotIntegerOrNull(value) {
  if (typeof value === 'number') {
    return (isFinite(value) && Math.floor(value) === value) ? value : null;
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return parseInt(value.trim(), 10);
  }
  return null;
}

// Case-insensitive lookup on column C. Returns the row number, or 0.
function findPilotRowByEmail(sheet, email) {
  var target = (email || '').toString().trim().toLowerCase();
  if (!target) return 0;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var emails = sheet.getRange(2, 3, lastRow - 1, 1).getValues();  // C
  for (var i = 0; i < emails.length; i++) {
    if ((emails[i][0] || '').toString().trim().toLowerCase() === target) return i + 2;
  }

  return 0;
}

// Everyone holding a place. Counted from an allowlist, so a blank or mistyped
// status can never quietly consume capacity. Rows with no email are not
// applicants ... getLastRow() reaches as far as the last scratch note in Notes.
// skipRow excludes a resubmitting applicant's own row, or they are counted
// against themselves and demoted from new to waitlisted on their own retry.
var PILOT_PLACE_HOLDING_STATUSES = ['new', 'approved', 'waitlisted'];

function countPilotActiveApplicants(sheet, skipRow) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var rows = sheet.getRange(2, 3, lastRow - 1, 10).getValues();  // C through L
  var count = 0;

  for (var i = 0; i < rows.length; i++) {
    if ((i + 2) === skipRow) continue;
    if (!(rows[i][0] || '').toString().trim()) continue;  // C
    var status = (rows[i][9] || '').toString().trim().toLowerCase();  // L
    if (PILOT_PLACE_HOLDING_STATUSES.indexOf(status) === -1) continue;
    count++;
  }

  return count;
}

// Notes accumulate rather than overwrite, so a resubmission never erases an
// earlier flag.
function pilotMergedNotes(existingNotes, note) {
  var current = (existingNotes || '').toString().trim();
  if (!note) return current;
  if (current.indexOf(note) !== -1) return current;
  return current ? current + ' | ' + note : note;
}

function pilotStoreFor(device) {
  if ((device || '').toString().trim().toLowerCase() === 'android') {
    return {
      'link': PLAY_STORE_LINK,
      'badge': "https://www.loomi.kids/assets/google-play-badge.svg",
      'alt': "Get it on Google Play"
    };
  }
  return {
    'link': APP_STORE_LINK,
    'badge': "https://www.loomi.kids/assets/app-store-badge.svg",
    'alt': "Download on the App Store"
  };
}

function pilotOutcomeMessage(outcome) {
  if (outcome === 'ineligible_age') {
    return "Thanks for asking ... this round is for children from their second birthday to their sixth, so we cannot place you this time. We will write when we open it up.";
  }
  if (outcome === 'waitlisted') {
    return "Thanks ... this cohort is full, so you are on the waitlist. We will be in touch the moment a place opens.";
  }
  return "Thanks ... your application is in. Watch your inbox over the next few days.";
}

function pilotError(message, cohortStartDate) {
  return {
    'result': 'error',
    'message': message,
    'cohortStartDate': cohortStartDate || ''
  };
}

// Pilot intake. Called from doPost when data.form is "pilot".
function handlePilotSubmission(data) {
  var cohortStartDate = "";
  var parentName;
  var email;
  var sheet;
  var recorded;

  // A double-tap would otherwise scan, find nothing, and append twice. The tab
  // creation sits inside the lock too, or two first submissions race to insert it.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (lockError) {
    return pilotError("We could not save that just now ... please try again in a moment.", cohortStartDate);
  }

  try {
    ensurePilotSheets();
    var config = readPilotConfig();
    cohortStartDate = config.cohortStartDate;

    if (data.website) {
      return pilotError("Bot detected", cohortStartDate);
    }

    // Fills-in-under-eight-seconds friction. Absent or malformed is a rejection:
    // the value is measured entirely in the browser, so there is no clock to compare.
    var elapsedMs = pilotIntegerOrNull(data.elapsedMs);
    if (elapsedMs === null || elapsedMs < 8000) {
      return pilotError("That came through a little quickly ... take another moment and send it again.", cohortStartDate);
    }

    parentName = (data.parentName || '').toString().trim();
    if (!parentName) {
      return pilotError("Please tell us your name so we know who to write back to.", cohortStartDate);
    }

    // Shape-checked rather than merely containing an "@", so a malformed address
    // is refused here instead of throwing inside GmailApp after the row is written.
    email = (data.email || '').toString().trim();
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
      return pilotError("Please give us an email address we can reach you at.", cohortStartDate);
    }

    var childAgeMonths = pilotIntegerOrNull(data.childAgeMonths);
    if (childAgeMonths === null) {
      return pilotError("Please give your child's age in whole months.", cohortStartDate);
    }

    // Nothing can be decided without a capacity, so nothing is recorded either.
    if (!(config.capacity > 0)) {
      Logger.log('Capacity missing or not a positive integer on the "' + PILOT_CONFIG_SHEET_NAME +
                 '" tab ... pilot application from ' + email + ' was not recorded.');
      return pilotError("We could not open applications just now ... please try again shortly.", cohortStartDate);
    }

    sheet        = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PILOT_SHEET_NAME);
    var themes   = (Object.prototype.toString.call(data.themes) === '[object Array]') ? data.themes : [];
    var band     = pilotAgeBand(childAgeMonths);
    var audience = derivePilotAudience(data.challenge, themes);

    var applicant = {
      'parentName': parentName,
      'email': email,
      'childAgeMonths': childAgeMonths,
      'band': band,
      'audience': audience,
      'themes': themes,
      'device': (data.device || '').toString().trim(),
      'tz': (data.tz || '').toString().trim(),
      'canCommit': (data.canCommit || '').toString().trim(),
      'challenge': (data.challenge || '').toString().trim(),
      'challengeOther': (data.challengeOther || '').toString().trim()
    };

    recorded = pilotRecordApplicant(sheet, config, applicant);

  } catch (error) {
    Logger.log('Pilot submission failed: ' + error);
    return pilotError("We could not save that just now ... please try again in a moment.", cohortStartDate);
  } finally {
    lock.releaseLock();
  }

  // Outside the lock ... the fan-out is a synchronous call to another service.
  // The row is already committed, so a failure here must not change the answer
  // the applicant sees, and must never surface a raw exception to the browser.
  try {
    pilotFanOut(sheet, recorded.row, null);
    if (recorded.acknowledge) {
      sendPilotAcknowledgement(parentName, email, cohortStartDate);
    }
  } catch (sideEffectError) {
    Logger.log('Pilot side effect failed for ' + email + ': ' + sideEffectError);
  }

  return {
    'result': 'success',
    'outcome': recorded.outcome,
    'message': pilotOutcomeMessage(recorded.outcome),
    'cohortStartDate': cohortStartDate
  };
}

// Read, decide, write. Runs under the script lock; sends nothing itself.
function pilotRecordApplicant(sheet, config, applicant) {
  var existingRow    = findPilotRowByEmail(sheet, applicant.email);
  var existingStatus = existingRow ? (sheet.getRange(existingRow, 12).getValue() || '').toString().trim().toLowerCase() : '';
  var protectedPlace = (existingStatus === 'approved');  // a row still at "new" has no place to protect

  var note = applicant.audience.tie ? 'audience tie, review' : '';
  if (applicant.challenge === 'other' && applicant.challengeOther) {
    note = pilotMergedNotes(note, 'challenge other: ' + applicant.challengeOther);
  }

  var status = 'new';
  var outcome = 'eligible';

  // The place already held is settled before anything in the new payload is read.
  if (protectedPlace) {
    status = existingStatus;
    if (!applicant.band) {
      note = pilotMergedNotes(note, 'resubmitted with an age outside the pilot bands, place kept');
    }
  } else if (!applicant.band) {
    status = 'ineligible';
    outcome = 'ineligible_age';
  } else if (existingStatus === 'waitlisted' || countPilotActiveApplicants(sheet, existingRow) >= config.capacity) {
    status = 'waitlisted';
    outcome = 'waitlisted';
  }

  var acknowledge = outcome === 'eligible' && !protectedPlace;
  if (acknowledge && !config.cohortStartDate) {
    note = pilotMergedNotes(note, 'cohort start date missing, acknowledgement not sent');
    acknowledge = false;
  }

  var values = [
    new Date(),
    applicant.parentName,
    applicant.email,
    applicant.childAgeMonths,
    applicant.band || '',
    applicant.device,
    applicant.tz,
    applicant.canCommit,
    applicant.challenge,
    applicant.themes.join(', '),
    applicant.audience.segment,
    status,
    '',
    '',
    note
  ];

  var row;
  if (existingRow) {
    row = existingRow;
    values[0]  = sheet.getRange(row, 1).getValue();   // A ... keep the first submission's timestamp
    values[12] = sheet.getRange(row, 13).getValue();  // M
    values[13] = sheet.getRange(row, 14).getValue();  // N
    values[14] = pilotMergedNotes(sheet.getRange(row, 15).getValue(), note);
    if (protectedPlace && !applicant.band) {
      values[3] = sheet.getRange(row, 4).getValue();  // D
      values[4] = sheet.getRange(row, 5).getValue();  // E
    }
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
  } else {
    sheet.appendRow(values);
    row = sheet.getLastRow();
  }

  return {
    'row': row,
    'outcome': outcome,
    'acknowledge': acknowledge
  };
}

// ============================================
// PILOT FIRESTORE FAN-OUT
//
// The receiving Cloud Function does not exist yet, so the flag stays off and
// the URL stays empty until it ships. The document id is a hash of the
// lowercased email, computed inside the Cloud Function so it cannot drift
// from what the console and the app compute.
// ============================================

var PILOT_FANOUT_ENABLED = false;
var PILOT_FANOUT_URL = "";
var PILOT_FANOUT_SECRET_PROPERTY = 'PILOT_FANOUT_SECRET';

function pilotFanOut(sheet, row, codeIssuedAt) {
  if (!PILOT_FANOUT_ENABLED || !PILOT_FANOUT_URL) return;

  try {
    var themesCell = (sheet.getRange(row, 10).getValue() || '').toString().trim();  // J

    var payload = {
      'parentName':          sheet.getRange(row, 2).getValue(),   // B
      'email':               sheet.getRange(row, 3).getValue(),   // C
      'childAgeMonths':      sheet.getRange(row, 4).getValue(),   // D
      'band':                sheet.getRange(row, 5).getValue(),   // E
      'device':              sheet.getRange(row, 6).getValue(),   // F
      'tz':                  sheet.getRange(row, 7).getValue(),   // G
      'canCommit':           sheet.getRange(row, 8).getValue(),   // H
      'challenge':           sheet.getRange(row, 9).getValue(),   // I
      'themes':              themesCell ? themesCell.split(/\s*,\s*/) : [],
      'audience':            sheet.getRange(row, 11).getValue(),  // K
      'status':              sheet.getRange(row, 12).getValue(),  // L
      'invitationCode':      sheet.getRange(row, 13).getValue(),  // M
      'codeIssuedAt':        codeIssuedAt || '',
      'approvalEmailSentAt': sheet.getRange(row, 14).getValue(),  // N
      'source':              "site_pilot_form",
      'submittedAt':         sheet.getRange(row, 1).getValue(),   // A
      'updatedAt':           new Date()
    };

    UrlFetchApp.fetch(PILOT_FANOUT_URL, {
      'method': 'post',
      'contentType': 'application/json',
      'headers': { 'X-Loomi-Pilot-Secret': PropertiesService.getScriptProperties().getProperty(PILOT_FANOUT_SECRET_PROPERTY) || '' },
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true
    });

  } catch (error) {
    sheet.getRange(row, 15).setValue(pilotMergedNotes(sheet.getRange(row, 15).getValue(), 'fan-out failed: ' + error));
  }
}

// ============================================
// PILOT INVITATION CODES
// ============================================

// 32 symbols: A-Z and 2-9 with O, 0, I and 1 removed. The contract excludes
// only those four, so S/5, B/8, Z/2 and G/6 stay confusable if a code is ever
// read aloud rather than typed.
var PILOT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var PILOT_CODE_LENGTH = 6;
var PILOT_CODE_MAX_ATTEMPTS = 50;

function generateInvitationCode(sheet) {
  var taken = {};
  var lastRow = sheet.getLastRow();

  for (var row = 2; row <= lastRow; row++) {
    var code = (sheet.getRange(row, 13).getValue() || '').toString().trim().toUpperCase();  // M
    if (code) { taken[code] = true; }
  }

  for (var attempt = 0; attempt < PILOT_CODE_MAX_ATTEMPTS; attempt++) {
    var candidate = '';
    for (var i = 0; i < PILOT_CODE_LENGTH; i++) {
      candidate += PILOT_CODE_ALPHABET.charAt(Math.floor(Math.random() * PILOT_CODE_ALPHABET.length));
    }
    if (!taken[candidate]) return candidate;
  }

  throw new Error("No free invitation code after " + PILOT_CODE_MAX_ATTEMPTS + " attempts.");
}

// ============================================
// EMAIL: pilot application received
// Sent automatically to an eligible applicant
// ============================================
function sendPilotAcknowledgement(parentName, email, cohortStartDate) {
  var firstName = firstNameOf(parentName);
  var subject = mimeEncodeSubject("Your Loomi pilot application " + MOON);

  var inner = `
    <tr>
      <td style="padding: 0 40px;">
        <h1 style="color: #ffffff; font-size: 25px; font-weight: 600; margin: 0 0 22px; text-align: center; line-height: 1.35;">
          Hi ${firstName}, thank you for putting your name in &#127769;
        </h1>

        <p style="color: #a5b4fc; font-size: 16px; line-height: 1.7; margin: 0 0 22px;">
          We read every application ourselves. The pilot is small on purpose, so it takes us a few days to work through them and match each family to the right stories.
        </p>

        <p style="color: #a5b4fc; font-size: 16px; line-height: 1.7; margin: 0 0 14px;">
          If there is a place for you, we will write again with an invitation code before the cohort starts on ${cohortStartDate}. Here is what those 21 nights ask of you:
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 26px;">
          <tr><td style="color: #a5b4fc; font-size: 15px; line-height: 1.8; padding-left: 6px;">
            &#8226;&nbsp; One Loomi story at bedtime, 21 nights in a row<br>
            &#8226;&nbsp; Three short questions the next morning, about a minute<br>
            &#8226;&nbsp; A note from you whenever something does not work
          </td></tr>
        </table>

        <p style="color: #a5b4fc; font-size: 16px; line-height: 1.7; margin: 0 0 22px;">
          Nothing to do for now. If your plans change, reply to this email and we will take your name out. &#128156;
        </p>

        <p style="color: #ffffff; font-size: 16px; margin: 0 0 4px;">
          Sweet dreams,<br>
          <span style="color: #f4a460;">The Loomi Team</span>
        </p>
      </td>
    </tr>
  `;

  var plainBody =
    "Hi " + firstName + ", thank you for putting your name in.\n\n" +
    "We read every application ourselves. The pilot is small on purpose, so it takes us a few days to work through them and match each family to the right stories.\n\n" +
    "If there is a place for you, we will write again with an invitation code before the cohort starts on " + cohortStartDate + ". Here is what those 21 nights ask of you:\n" +
    " - One Loomi story at bedtime, 21 nights in a row\n" +
    " - Three short questions the next morning, about a minute\n" +
    " - A note from you whenever something does not work\n\n" +
    "Nothing to do for now. If your plans change, reply to this email and we will take your name out.\n\n" +
    "Sweet dreams,\n" +
    "The Loomi Team\n" +
    "www.loomi.kids";

  GmailApp.sendEmail(email, subject, plainBody, {
    htmlBody: loomiEmailShell(inner),
    from: "hello@loomi.kids",
    name: "Loomi"
  });
}

// ============================================
// EMAIL: pilot approval + invitation code
// Sent from the "Pilot Applicants" tab
// ============================================
function sendPilotApproval(parentName, email, invitationCode, device, cohortStartDate) {
  var firstName = firstNameOf(parentName);
  var store = pilotStoreFor(device);
  var subject = mimeEncodeSubject("You have a place in the Loomi pilot " + MOON);

  var inner = `
    <tr>
      <td style="padding: 0 40px;">
        <h1 style="color: #ffffff; font-size: 25px; font-weight: 600; margin: 0 0 22px; text-align: center; line-height: 1.35;">
          Hi ${firstName}, you are in &#127769;
        </h1>

        <p style="color: #a5b4fc; font-size: 16px; line-height: 1.7; margin: 0 0 22px;">
          A place in the pilot is yours. It starts on ${cohortStartDate} and runs for 21 nights. &#128156;
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 26px;">
          <tr>
            <td style="background: rgba(244, 164, 96, 0.1); border: 1px solid rgba(244, 164, 96, 0.3); border-radius: 16px; padding: 26px; text-align: center;">
              <p style="color: #ffffff; font-size: 19px; font-weight: 600; margin: 0 0 6px;">
                Your invitation code
              </p>
              <p style="color: #a5b4fc; font-size: 15px; line-height: 1.6; margin: 0 0 18px;">
                It links your account to the pilot, so keep it close.
              </p>
              <div style="background: #0a0e1f; border: 1px dashed rgba(244, 164, 96, 0.55); border-radius: 10px; padding: 14px 22px; display: inline-block;">
                <span style="color: #f4a460; font-size: 22px; font-weight: 600; letter-spacing: 4px; font-family: 'Courier New', Courier, monospace;">${invitationCode}</span>
              </div>
              <p style="color: #8b9dc3; font-size: 13px; line-height: 1.6; margin: 16px 0 0;">
                Have it ready the first time you open Loomi.
              </p>
            </td>
          </tr>
        </table>

        <h2 style="color: #ffffff; font-size: 19px; font-weight: 600; margin: 0 0 12px;">
          What the 21 nights ask for
        </h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 26px;">
          <tr><td style="color: #a5b4fc; font-size: 15px; line-height: 1.8; padding-left: 6px;">
            &#8226;&nbsp; One Loomi story at bedtime, 21 nights in a row<br>
            &#8226;&nbsp; Three short questions the next morning, about a minute<br>
            &#8226;&nbsp; A note from you whenever something does not work, in as much detail as you can spare
          </td></tr>
        </table>

        <p style="color: #a5b4fc; font-size: 16px; line-height: 1.7; margin: 0 0 14px;">
          One thing to do before ${cohortStartDate}: install Loomi and sign in, so night one is nothing but a story.
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 26px;">
          <tr>
            <td align="center" style="padding: 8px 0 16px;">
              <a href="${store.link}" style="display: inline-block; line-height: 0; text-decoration: none;">
                <img src="${store.badge}" alt="${store.alt}" height="56" style="height: 56px; width: auto; display: inline-block;">
              </a>
            </td>
          </tr>
        </table>

        <p style="color: #a5b4fc; font-size: 16px; line-height: 1.7; margin: 0 0 22px;">
          If a night goes sideways, or the code does not take, reply to this email and one of us will pick it up.
        </p>

        <p style="color: #ffffff; font-size: 16px; margin: 0 0 4px;">
          Sweet dreams,<br>
          <span style="color: #f4a460;">The Loomi Team</span>
        </p>
      </td>
    </tr>
  `;

  var plainBody =
    "Hi " + firstName + ", you are in.\n\n" +
    "A place in the pilot is yours. It starts on " + cohortStartDate + " and runs for 21 nights.\n\n" +
    "YOUR INVITATION CODE\n" +
    "    " + invitationCode + "\n\n" +
    "It links your account to the pilot, so keep it close and have it ready the first time you open Loomi.\n\n" +
    "WHAT THE 21 NIGHTS ASK FOR\n" +
    " - One Loomi story at bedtime, 21 nights in a row\n" +
    " - Three short questions the next morning, about a minute\n" +
    " - A note from you whenever something does not work, in as much detail as you can spare\n\n" +
    "One thing to do before " + cohortStartDate + ": install Loomi and sign in, so night one is nothing but a story.\n" +
    store.link + "\n\n" +
    "If a night goes sideways, or the code does not take, reply to this email and one of us will pick it up.\n\n" +
    "Sweet dreams,\n" +
    "The Loomi Team\n" +
    "www.loomi.kids";

  GmailApp.sendEmail(email, subject, plainBody, {
    htmlBody: loomiEmailShell(inner),
    from: "hello@loomi.kids",
    name: "Loomi"
  });
}

// ============================================
// PILOT ... review actions
// ============================================

// Guard: returns the Pilot Applicants sheet only if it is the active sheet.
function getActivePilotSheetOrWarn() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getName() !== PILOT_SHEET_NAME) {
    SpreadsheetApp.getUi().alert(
      'Open the "' + PILOT_SHEET_NAME + '" tab first, then select the rows to act on.'
    );
    return null;
  }
  return sheet;
}

// Issue an invitation code to every selected row already marked "approved".
// This is what makes a code exist; nothing else writes column M.
function approvePilotSelectedRows() {
  var sheet = getActivePilotSheetOrWarn();
  if (!sheet) return;

  var ranges = sheet.getActiveRangeList().getRanges();
  var considered = 0;
  var issued = 0, skippedNotApproved = 0, skippedHasCode = 0;

  for (var r = 0; r < ranges.length; r++) {
    var startRow = ranges[r].getRow();
    var numRows = ranges[r].getNumRows();
    if (startRow === 1) { startRow = 2; numRows = numRows - 1; }  // skip header
    if (numRows < 1) continue;
    considered += numRows;

    for (var i = 0; i < numRows; i++) {
      var row = startRow + i;
      var status = sheet.getRange(row, 12).getValue();  // L
      var code   = sheet.getRange(row, 13).getValue();  // M

      if ((status || '').toString().trim().toLowerCase() !== 'approved') { skippedNotApproved++; continue; }
      if (code)                                                         { skippedHasCode++;     continue; }  // never reissue

      var issuedAt = new Date();
      sheet.getRange(row, 13).setValue(generateInvitationCode(sheet));
      pilotFanOut(sheet, row, issuedAt);
      issued++;
    }
  }

  if (!considered) {
    SpreadsheetApp.getUi().alert('Select one or more data rows first.');
    return;
  }

  SpreadsheetApp.getUi().alert(
    '✅ Invitation Codes\n\n' +
    'Issued: ' + issued + '\n' +
    'Skipped ... status is not approved: ' + skippedNotApproved + '\n' +
    'Skipped ... already has a code: ' + skippedHasCode
  );
}

// Send the approval email to the currently selected rows.
// Only goes to rows that already carry an invitation code.
function sendPilotApprovalToSelectedRows() {
  var sheet = getActivePilotSheetOrWarn();
  if (!sheet) return;

  var config = readPilotConfig();
  if (!config.cohortStartDate) {
    SpreadsheetApp.getUi().alert(
      'Set the cohort start date on the "' + PILOT_CONFIG_SHEET_NAME + '" tab first ... the approval email names it.'
    );
    return;
  }

  var ranges = sheet.getActiveRangeList().getRanges();
  var considered = 0;
  var sent = 0, skippedSent = 0, skippedNoCode = 0, skippedNoEmail = 0;

  for (var r = 0; r < ranges.length; r++) {
    var startRow = ranges[r].getRow();
    var numRows = ranges[r].getNumRows();
    if (startRow === 1) { startRow = 2; numRows = numRows - 1; }  // skip header
    if (numRows < 1) continue;
    considered += numRows;

    for (var i = 0; i < numRows; i++) {
      var row = startRow + i;
      var name     = sheet.getRange(row, 2).getValue();   // B
      var email    = sheet.getRange(row, 3).getValue();   // C
      var device   = sheet.getRange(row, 6).getValue();   // F
      var code     = sheet.getRange(row, 13).getValue();  // M
      var sentAt   = sheet.getRange(row, 14).getValue();  // N

      if (!email)  { skippedNoEmail++; continue; }
      if (!code)   { skippedNoCode++;  continue; }  // never send an approval without a code
      if (sentAt)  { skippedSent++;    continue; }  // already sent

      sendPilotApproval(name, email, code.toString().trim(), device, config.cohortStartDate);
      sheet.getRange(row, 14).setValue(new Date());
      sent++;
      Utilities.sleep(600);
    }
  }

  if (!considered) {
    SpreadsheetApp.getUi().alert('Select one or more data rows first.');
    return;
  }

  SpreadsheetApp.getUi().alert(
    '✅ Pilot Approval\n\n' +
    'Sent: ' + sent + '\n' +
    'Skipped ... already sent: ' + skippedSent + '\n' +
    'Skipped ... missing invitation code: ' + skippedNoCode + '\n' +
    'Skipped ... missing email: ' + skippedNoEmail
  );
}

// Preview: sends the approval email to the address below with a sample code
// so the team can eyeball it before any real send.
var PILOT_PREVIEW_EMAIL = "hello@loomi.kids";
function testPilotApprovalEmail() {
  var config = readPilotConfig();
  if (!config.cohortStartDate) {
    SpreadsheetApp.getUi().alert(
      'Set the cohort start date on the "' + PILOT_CONFIG_SHEET_NAME + '" tab first ... both pilot emails name it.'
    );
    return;
  }

  sendPilotApproval("Test Parent", PILOT_PREVIEW_EMAIL, "K7M2QD", 'ios', config.cohortStartDate);
  Utilities.sleep(800);
  sendPilotAcknowledgement("Test Parent", PILOT_PREVIEW_EMAIL, config.cohortStartDate);
  SpreadsheetApp.getUi().alert('Sent both pilot emails to ' + PILOT_PREVIEW_EMAIL + ' for preview.');
}


// ============================================
// SPREADSHEET MENU
// ============================================

// Add a custom menu when the spreadsheet opens
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🌙 Loomi')
    .addItem('Send Welcome Email to Selected Rows', 'sendWelcomeToSelectedRows')
    .addItem('Send Welcome Email to All Unsent', 'sendWelcomeToAllUnsent')
    .addSeparator()
    .addItem('Mark Selected as Welcome Sent', 'markSelectedAsWelcomeSent')
    .addSeparator()
    .addSubMenu(ui.createMenu('🚀 Launch Campaign')
      .addItem('Set up GA Campaign sheet', 'setupGACampaignSheet')
      .addSeparator()
      .addItem('Send GA Announcement to Selected Rows', 'sendGAAnnouncementToSelectedRows')
      .addItem('Send Review Nudge to Selected Rows', 'sendReviewNudgeToSelectedRows')
      .addSeparator()
      .addItem('Preview both emails (test send)', 'testGACampaignEmails'))
    .addSubMenu(ui.createMenu('🧪 Pilot')
      .addItem('Set up Pilot sheets', 'setupPilotApplicantsSheet')
      .addSeparator()
      .addItem('Issue Invitation Codes for Selected Rows', 'approvePilotSelectedRows')
      .addItem('Send Pilot Approval to Selected Rows', 'sendPilotApprovalToSelectedRows')
      .addSeparator()
      .addItem('Preview pilot emails (test send)', 'testPilotApprovalEmail'))
    .addToUi();
}

// ============================================
// MANUAL WELCOME EMAIL SENDING
// ============================================

// Send welcome email to currently selected rows
function sendWelcomeToSelectedRows() {
  var sheet = getActiveNewsletterSheetOrWarn();
  if (!sheet) return;

  var selection = sheet.getActiveRange();
  var startRow = selection.getRow();
  var numRows = selection.getNumRows();

  if (startRow === 1) {
    startRow = 2;
    numRows = numRows - 1;
  }

  var sentCount = 0;
  var skippedCount = 0;

  for (var i = 0; i < numRows; i++) {
    var row = startRow + i;
    var parentName = sheet.getRange(row, 2).getValue();  // Column B
    var email = sheet.getRange(row, 3).getValue();        // Column C
    var welcomeSent = sheet.getRange(row, 8).getValue();  // Column H

    // Skip if already sent or no email
    if (!email || welcomeSent) {
      skippedCount++;
      continue;
    }

    sendUserConfirmation(parentName, email);

    // Mark as sent with timestamp in Column H
    sheet.getRange(row, 8).setValue(new Date());
    sentCount++;

    Utilities.sleep(500);
  }

  SpreadsheetApp.getUi().alert(
    '✅ Welcome Emails Sent!\n\n' +
    'Sent: ' + sentCount + '\n' +
    'Skipped (already sent or no email): ' + skippedCount
  );
}

// Send welcome email to ALL rows that haven't received it yet
function sendWelcomeToAllUnsent() {
  var sheet = getActiveNewsletterSheetOrWarn();
  if (!sheet) return;

  var ui = SpreadsheetApp.getUi();
  var response = ui.alert(
    'Send Welcome Emails',
    'This will send the Welcome email to ALL signups who haven\'t received one yet. Continue?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  var lastRow = sheet.getLastRow();
  var sentCount = 0;

  for (var row = 2; row <= lastRow; row++) {
    var parentName = sheet.getRange(row, 2).getValue();
    var email = sheet.getRange(row, 3).getValue();
    var welcomeSent = sheet.getRange(row, 8).getValue();  // Column H

    if (!email || welcomeSent) {
      continue;
    }

    sendUserConfirmation(parentName, email);
    sheet.getRange(row, 8).setValue(new Date());
    sentCount++;

    Utilities.sleep(500);
  }

  ui.alert('✅ Done! Sent ' + sentCount + ' Welcome emails.');
}

// Mark selected rows as welcome email already sent
function markSelectedAsWelcomeSent() {
  var sheet = getActiveNewsletterSheetOrWarn();
  if (!sheet) return;

  var selection = sheet.getActiveRange();
  var startRow = selection.getRow();
  var numRows = selection.getNumRows();

  if (startRow === 1) {
    startRow = 2;
    numRows = numRows - 1;
  }

  for (var i = 0; i < numRows; i++) {
    var row = startRow + i;
    sheet.getRange(row, 8).setValue(new Date());
  }

  SpreadsheetApp.getUi().alert('✅ Marked ' + numRows + ' rows as Welcome email sent.');
}

// Test welcome email
function testWelcomeEmail() {
  sendUserConfirmation("Test Parent", "shahinz@mac.com");
}
