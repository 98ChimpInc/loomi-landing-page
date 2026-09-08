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

// Name of the spreadsheet tab that drives the GA launch campaign.
var GA_SHEET_NAME = "GA Campaign";

// Crescent-moon emoji 🌙, built from its code point. A literal emoji
// character in the source can get mangled in transit (clasp / GAS file
// handling) and arrive in the subject line as "������"; constructing it
// from the code point keeps the source pure-ASCII and the emoji intact.
var MOON = String.fromCodePoint(0x1F319);

// Handle form submissions from landing page
function doPost(e) {
  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);

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

// Handle GET requests (for testing)
function doGet(e) {
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
  var sheet = ss.insertSheet(GA_SHEET_NAME);
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
    .addToUi();
}

// ============================================
// MANUAL WELCOME EMAIL SENDING
// ============================================

// Send welcome email to currently selected rows
function sendWelcomeToSelectedRows() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
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
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert(
    'Send Welcome Emails',
    'This will send the Welcome email to ALL signups who haven\'t received one yet. Continue?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
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
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
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
