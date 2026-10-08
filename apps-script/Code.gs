/**
 * A PLACE ABOUT FALLING — Google Apps Script backend (one copy per person)
 *
 * Lives inside a Google Sheet. Everyone who wants their own page makes a
 * copy of that sheet (the script comes along), opens the menu
 * "🧗 A Place About Falling → Set up" and follows the side panel.
 * Nobody has to edit this file.
 *
 * The page itself is shared: PAGE_BASE below. A person's link is
 * PAGE_BASE + "?c=<their deployment id>", so the page knows which copy of
 * this script to talk to. Data only ever goes between the visitor's
 * browser and that person's own Google account.
 *
 *   GET  ?action=feed                → { profile, now, sessions[], availability, v }
 *   GET  ?action=confirm|unsubscribe|leave&token=…  (small HTML pages)
 *   POST { action: 'join' | 'leave' | 'request' | 'subscribe' | 'checkin' | 'checkout', … }
 *   POST { action: 'dashboard' | 'deleteSubscriber', key, … }   (admin only)
 *
 * FOR THE PERSON WHO RUNS THE MASTER COPY (you, once):
 *   see OWNER-SETUP.md. In short: new Google Sheet → Extensions → Apps Script →
 *   paste Code.gs + Setup.html → Services (+) "Google Calendar API" →
 *   run prepareTemplate once → share the sheet "anyone with the link can view" →
 *   send friends  https://docs.google.com/spreadsheets/d/<SHEET-ID>/copy
 */

/* ───────────────────────── fixed settings (same for everyone) ───────────────────────── */

// ✏️ (owner only) where the shared page lives. Every copy builds its links from this.
var PAGE_BASE = 'https://mamfredm.github.io/a-place-about-falling/';

// bump when this file changes in a way the page needs to know about
var BACKEND_VERSION = 1;

var FIXED = {
  daysAhead: 21,               // how far ahead sessions are shown
  announceDaysAhead: 14,       // how far ahead new sessions are emailed to subscribers
  availabilityDays: 60,
  dayParts: { m: ['08:00', '12:00'], a: ['12:00', '17:00'], e: ['17:00', '22:30'] },
  minBusyMinutes: 60,
  allDayBlockWords: ['urlaub', 'vacation', 'holiday', 'krank', 'sick', 'away', 'reise', 'trip', 'busy']
};

// gyms offered in the setup panel (people can add their own there)
var DEFAULT_GYMS = [
  { location: 'Düsseldorf', gyms: [
    { name: 'Superblock',            address: 'Fichtenstraße 53, 40233 Düsseldorf' },
    { name: 'Einstein Düsseldorf',   address: 'Lierenfelder Str. 49, 40231 Düsseldorf' },
    { name: 'Monkeyspot Düsseldorf', address: 'Schiessstraße 52, 40549 Düsseldorf' }
  ]},
  { location: 'Duisburg', gyms: [
    { name: 'Monkeyspot Duisburg',   address: 'Neuenhofstraße 91, 47055 Duisburg' },
    { name: 'Stuntwerk Duisburg',    address: 'Neudorfer Str. 109-113, 47057 Duisburg' },
    { name: 'Einstein Duisburg',     address: 'Essenberger Straße 85, 47059 Duisburg' }
  ]},
  { location: 'Wuppertal', gyms: [
    { name: 'Prisma',                address: 'Vohwinkeler Straße 119, 42329 Wuppertal' }
  ]},
  { location: 'Köln', gyms: [
    { name: 'Boulderplanet',         address: 'Oskar-Jäger-Straße 143h, 50825 Köln' }
  ]},
  { location: 'Dortmund', gyms: [
    { name: 'Boulderwelt Dortmund',  address: 'Brennaborstraße 10, 44149 Dortmund' },
    { name: 'Kletterhalle Bergwerk', address: 'Emscherallee 33, 44369 Dortmund' }
  ]}
];

/* ───────────────────────── personal settings (from the setup panel) ───────────────────────── */

var _cfg = null;
// Everything person-specific, saved by the setup panel in Script Properties.
function C() {
  if (_cfg) return _cfg;
  var p = PropertiesService.getScriptProperties();
  var s = {};
  try { s = JSON.parse(p.getProperty('SETTINGS') || '{}'); } catch (e) { s = {}; }
  var dep = p.getProperty('DEPLOYMENT_ID') || '';
  _cfg = {
    hostName: s.hostName || 'me',
    title: s.title || 'Where my skin goes to die',
    intro: s.intro || '',
    contactName: s.contactName || '',
    contactEmail: s.contactEmail || '',
    calendarId: s.calendarId || '',
    availabilityCalendarIds: (s.availabilityCalendarIds && s.availabilityCalendarIds.length) ? s.availabilityCalendarIds : ['primary'],
    gyms: (s.gyms && s.gyms.length) ? s.gyms : DEFAULT_GYMS,
    hangoutUrl: s.hangoutUrl || '',
    spontaneousTitle: s.spontaneousTitle || 'Spontaneous session',
    adminKey: p.getProperty('ADMIN_KEY') || '',
    hostEmail: s.notifyEmail || Session.getEffectiveUser().getEmail(),
    deploymentId: dep,
    pageUrl: dep ? PAGE_BASE + '?c=' + dep : PAGE_BASE
  };
  for (var k in FIXED) _cfg[k] = FIXED[k];
  return _cfg;
}
function isSetUp() {
  var p = PropertiesService.getScriptProperties();
  return !!(p.getProperty('SETTINGS') && p.getProperty('SHEET_ID') && C().calendarId);
}

/* ───────────────────────── HTTP entry points ───────────────────────── */

function doGet(e) {
  var p = e.parameter || {};
  try {
    if (p.action === 'feed') return jsonOut(isSetUp() ? feed() : { error: 'not_set_up', v: BACKEND_VERSION });
    if (p.action === 'confirm') return htmlOut(confirmSubscriber(p.token));
    if (p.action === 'unsubscribe') return htmlOut(unsubscribe(p.token));
    if (p.action === 'leave') return htmlOut(leaveByLink(p.token));
    return jsonOut({ error: 'unknown_action' });
  } catch (err) {
    return jsonOut({ error: 'server_error', message: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    switch (body.action) {
      case 'join':      return jsonOut(join(body));
      case 'leave':     return jsonOut(leave(body.token));
      case 'request':   return jsonOut(request(body));
      case 'subscribe': return jsonOut(subscribe(body));
      case 'checkin':   return jsonOut(checkin(body));
      case 'checkout':  return jsonOut(checkout(body));
      case 'dashboard': return jsonOut(dashboard(body));
      case 'deleteSubscriber': return jsonOut(deleteSubscriber(body));
    }
    return jsonOut({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return jsonOut({ ok: false, error: 'server_error', message: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function htmlOut(res) {
  var html = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + esc(res.title) + '</title>'
    + '<body style="margin:0;background:#1c1b19;color:#fff8e6;font-family:Avenir Next,Helvetica Neue,Arial,sans-serif;'
    + 'display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;box-sizing:border-box">'
    + '<div style="max-width:420px"><h1 style="font-size:30px;font-weight:800;letter-spacing:-0.02em;margin:0 0 10px">'
    + esc(res.title) + '</h1><p style="color:#c9c3b5;line-height:1.5;margin:0 0 22px">' + esc(res.text) + '</p>'
    + '<a href="' + esc(C().pageUrl) + '" style="display:inline-block;background:#fcba01;color:#1c1b19;'
    + 'font-weight:800;text-decoration:none;padding:13px 22px;border-radius:12px">See the sessions</a></div></body>';
  return HtmlService.createHtmlOutput(html).setTitle(res.title);
}

/* ───────────────────────── data sheet ───────────────────────── */

var SHEETS = {
  Joins:       ['sessionId', 'start', 'gym', 'name', 'email', 'token', 'createdAt', 'status'],
  Requests:    ['createdAt', 'name', 'email', 'gym', 'when', 'note'],
  Subscribers: ['email', 'name', 'token', 'status', 'createdAt'],
  Announced:   ['sessionId', 'announcedAt'],
  // one row per "I'm here" — the dashboard's visit history
  Visits:      ['visitId', 'gym', 'location', 'type', 'checkIn', 'plannedUntil', 'checkOut', 'minutes', 'closedBy', 'eventId', 'effort']
};

// the data lives in tabs of the very sheet this script belongs to
var _ss = null;
function db() {
  if (_ss) return _ss;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('not_set_up');
  var ss = SpreadsheetApp.openById(id);
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.appendRow(SHEETS[name]);
      sh.setFrozenRows(1);
      return;
    }
    // older tab without a newer column? add the missing headers at the end
    var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
    SHEETS[name].forEach(function (col) {
      if (head.indexOf(col) === -1) { sh.getRange(1, head.length + 1).setValue(col); head.push(col); }
    });
  });
  _ss = ss;
  return ss;
}

function rows(name) {
  var sh = db().getSheetByName(name);
  var values = sh.getDataRange().getValues();
  var head = values.shift();
  return values.map(function (r, i) {
    var o = { _row: i + 2 };
    head.forEach(function (h, j) { o[h] = r[j]; });
    return o;
  });
}

function setCell(name, rowNo, column, value) {
  var sh = db().getSheetByName(name);
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.getRange(rowNo, head.indexOf(column) + 1).setValue(value);
}

// append a row by column name (works even if columns were added later)
function appendByHeader(name, obj) {
  var sh = db().getSheetByName(name);
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(head.map(function (h) { return obj[h] === undefined ? '' : obj[h]; }));
}

function token() { return Utilities.getUuid().replace(/-/g, ''); }

/* ───────────────────────── sessions from the calendar ───────────────────────── */

function calendar() {
  var cal = CalendarApp.getCalendarById(C().calendarId);
  if (!cal) throw new Error('Calendar not found — run the setup again');
  return cal;
}

function sessions() {
  var now = new Date();
  var until = new Date(now.getTime() + C().daysAhead * 86400000);
  return calendar().getEvents(now, until)
    .filter(function (ev) { return !ev.isAllDayEvent() && ev.getEndTime() > now; })
    .map(function (ev) {
      var location = (ev.getLocation() || '').trim();
      var gym = location.split(',')[0].trim() || ev.getTitle();
      var title = ev.getTitle();
      return {
        id: ev.getId().replace(/@.*/, '') + '_' + ev.getStartTime().getTime(),
        start: ev.getStartTime().getTime(),
        end: ev.getEndTime().getTime(),
        gym: gym,
        location: location,
        label: title && title !== gym ? title : ''
      };
    })
    .sort(function (a, b) { return a.start - b.start; });
}

// "at the gym right now": a manual check-in wins; otherwise a running calendar session
function liveNow(list) {
  var raw = PropertiesService.getScriptProperties().getProperty('CHECKIN');
  if (raw) {
    var c = JSON.parse(raw);
    if (c.until > Date.now()) return { gym: c.gym, location: c.location || c.gym, until: c.until, manual: true, effort: c.effort || '' };
    closeOpenVisit(c.until, 'auto');   // forgot "I've left": close it at the planned end
  }
  var t = Date.now();
  var running = list.filter(function (s) { return s.start <= t && s.end > t; })[0];
  return running ? { gym: running.gym, location: running.location, until: running.end, manual: false } : null;
}

function feed() {
  var list = sessions();
  var joins = rows('Joins').filter(function (j) { return j.status === 'going'; });
  list.forEach(function (s) {
    s.going = joins.filter(function (j) { return j.sessionId === s.id; })
                   .map(function (j) { return String(j.name).split(' ')[0]; });   // first names only
  });
  var c = C();
  return {
    v: BACKEND_VERSION,
    profile: { name: c.hostName === 'me' ? '' : c.hostName, title: c.title, intro: c.intro, gyms: c.gyms,
               hangoutUrl: c.hangoutUrl, contact: { name: c.contactName, email: c.contactEmail } },
    now: liveNow(list), sessions: list, host: c.hostName, availability: availability()
  };
}

/* ───────────────────────── free / busy (privacy-safe) ───────────────────────── */

// { 'YYYY-MM-DD': 'ae' }  → letters = busy parts of that day (m = morning,
// a = afternoon, e = evening). Days with nothing busy are left out.
// Cached for 10 minutes so page visits don't hammer your calendars.
function availability() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('availability_v2');
  if (hit) return JSON.parse(hit);

  var tz = Session.getScriptTimeZone();
  var start = new Date(); start.setHours(0, 0, 0, 0);
  var end = new Date(start.getTime() + C().availabilityDays * 86400000);

  var busy = busyIntervals(start, end);           // [[startMs, endMs], …] — no titles
  var blockedDays = keywordBlockedDays(start, end, tz);

  var out = {};
  for (var day = new Date(start); day < end; day.setDate(day.getDate() + 1)) {
    var key = Utilities.formatDate(day, tz, 'yyyy-MM-dd');
    if (blockedDays[key]) { out[key] = 'mae'; continue; }
    var parts = '';
    Object.keys(C().dayParts).forEach(function (part) {
      var from = partTime(day, C().dayParts[part][0]), to = partTime(day, C().dayParts[part][1]);
      var minutes = 0;
      busy.forEach(function (iv) {
        var o = Math.min(to, iv[1]) - Math.max(from, iv[0]);
        if (o > 0) minutes += o / 60000;
      });
      if (minutes >= Math.min(C().minBusyMinutes, (to - from) / 60000)) parts += part;
    });
    if (parts) out[key] = parts;
  }
  cache.put('availability_v2', JSON.stringify(out), 600);
  return out;
}

// Busy time ranges across all availabilityCalendarIds.
// Preferred: Google's free/busy query (Advanced Service "Calendar"), which
// honours each event's Busy/Free setting — all-day busy blocks included.
// Fallback (service not enabled): timed events only, via CalendarApp.
function busyIntervals(start, end) {
  var ids = C().availabilityCalendarIds;
  if (typeof Calendar !== 'undefined' && Calendar.Freebusy) {
    try {
      var out = [];
      for (var a = new Date(start); a < end; a = new Date(a.getTime() + 30 * 86400000)) {
        var b = new Date(Math.min(end.getTime(), a.getTime() + 30 * 86400000));
        var res = Calendar.Freebusy.query({
          timeMin: a.toISOString(), timeMax: b.toISOString(),
          items: ids.map(function (id) { return { id: id }; })
        });
        Object.keys(res.calendars || {}).forEach(function (calId) {
          var c = res.calendars[calId];
          if (c.errors && c.errors.length) Logger.log('Free/busy: no access to ' + calId + ' (' + c.errors[0].reason + ')');
          (c.busy || []).forEach(function (iv) { out.push([Date.parse(iv.start), Date.parse(iv.end)]); });
        });
      }
      return out;
    } catch (e) {
      Logger.log('Free/busy query failed, using fallback: ' + e);
    }
  }
  var timed = [];
  ids.forEach(function (id) {
    var cal = null;
    try { cal = id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id); } catch (e) {}
    if (!cal) return;
    cal.getEvents(start, end).forEach(function (ev) {
      if (!ev.isAllDayEvent()) timed.push([ev.getStartTime().getTime(), ev.getEndTime().getTime()]);
    });
  });
  return timed;
}

// All-day events whose title contains a block word (even if marked Free)
function keywordBlockedDays(start, end, tz) {
  var days = {};
  if (!C().allDayBlockWords || !C().allDayBlockWords.length) return days;
  C().availabilityCalendarIds.forEach(function (id) {
    var cal = null;
    try { cal = id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id); } catch (e) {}
    if (!cal) return;
    cal.getEvents(start, end).forEach(function (ev) {
      if (!ev.isAllDayEvent()) return;
      var title = (ev.getTitle() || '').toLowerCase();
      // case-insensitive on both sides: 'Emil' and 'emil' both work
      if (!C().allDayBlockWords.some(function (w) { return title.indexOf(String(w).toLowerCase()) !== -1; })) return;
      for (var d = new Date(ev.getAllDayStartDate()); d < ev.getAllDayEndDate(); d.setDate(d.getDate() + 1)) {
        days[Utilities.formatDate(d, tz, 'yyyy-MM-dd')] = true;
      }
    });
  });
  return days;
}

// Run this from the editor to see what the page would get (and which
// calendars the script can't read). Bypasses the 10-minute cache.
function testAvailability() {
  CacheService.getScriptCache().remove('availability_v2');
  Logger.log(JSON.stringify(availability(), null, 1));
}

function partTime(day, hhmm) {
  var p = hhmm.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), p[0], p[1]).getTime();
}

/* ───────────────────────── join / leave ───────────────────────── */

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200; }

function join(body) {
  var name = clean(body.name, 40), email = clean(body.email, 200).toLowerCase();
  if (!name || !validEmail(email)) return { ok: false, error: 'bad_request' };
  var s = sessions().filter(function (x) { return x.id === body.sessionId; })[0];
  if (!s) return { ok: false, error: 'session_gone' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'server_busy' };
  try {
    var existing = rows('Joins').filter(function (j) {
      return j.sessionId === s.id && j.email === email && j.status === 'going';
    })[0];
    if (existing) return { ok: true, token: existing.token, already: true };

    var t = token();
    db().getSheetByName('Joins').appendRow([s.id, new Date(s.start), s.gym, name, email, t, new Date(), 'going']);
    sendInvite(s, name, email, t);
    notifyHost('joins', name + ' joins ' + whenLabel(new Date(s.start)) + ' at ' + s.gym, email);
    return { ok: true, token: t };
  } finally {
    lock.releaseLock();
  }
}

function leave(tok) {
  var j = rows('Joins').filter(function (r) { return r.token === tok && r.status === 'going'; })[0];
  if (!j) return { ok: false, error: 'not_found' };
  setCell('Joins', j._row, 'status', 'left');
  notifyHost('cancelled', j.name + " can't make it on " + whenLabel(new Date(j.start)) + ' at ' + j.gym, j.email);
  return { ok: true };
}

function leaveByLink(tok) {
  var r = leave(tok);
  return r.ok
    ? { title: 'Got it, next time', text: "You're off the list for that session. The invite in your calendar can be deleted." }
    : { title: 'Nothing to cancel', text: 'That spot was already cancelled, or the link is old.' };
}

/* ───────────────────────── request another gym / day ───────────────────────── */

function request(body) {
  var name = clean(body.name, 40), email = clean(body.email, 200).toLowerCase();
  var gym = clean(body.gym, 80), when = clean(body.when, 60), note = clean(body.note, 400);
  if (!name || !validEmail(email) || !gym) return { ok: false, error: 'bad_request' };
  db().getSheetByName('Requests').appendRow([new Date(), name, email, gym, when, note]);
  MailApp.sendEmail({
    to: C().hostEmail,
    replyTo: email,
    subject: 'Bouldering pitch: ' + gym + (when ? ', ' + when : '') + ' (' + name + ')',
    body: name + ' would like to climb with you.\n\nGym: ' + gym + '\nWhen: ' + (when || 'open') +
          (note ? '\nNote: ' + note : '') + '\n\nReply to this email to answer ' + name + ' directly. ' +
          'If you say yes, add the session to your bouldering calendar and it shows up on the page.'
  });
  return { ok: true };
}

/* ───────────────────────── notify me (double opt-in) ───────────────────────── */

function subscribe(body) {
  var email = clean(body.email, 200).toLowerCase(), name = clean(body.name, 40);
  if (!validEmail(email)) return { ok: false, error: 'bad_request' };
  var existing = rows('Subscribers').filter(function (r) { return r.email === email; })[0];
  if (existing && existing.status === 'active') return { ok: true, already: true };

  var t = existing ? existing.token : token();
  if (existing) setCell('Subscribers', existing._row, 'status', 'pending');
  else db().getSheetByName('Subscribers').appendRow([email, name, t, 'pending', new Date()]);

  var link = ScriptApp.getService().getUrl() + '?action=confirm&token=' + t;
  MailApp.sendEmail({
    to: email,
    subject: 'Confirm: session updates from ' + C().hostName,
    htmlBody: mailShell('One tap to confirm',
      'Confirm and you get a short email whenever a new bouldering session goes up. Nothing else, and you can stop it anytime.',
      [{ href: link, text: 'Yes, keep me posted' }])
  });
  return { ok: true };
}

function confirmSubscriber(tok) {
  var r = rows('Subscribers').filter(function (x) { return x.token === tok; })[0];
  if (!r) return { title: 'Link expired', text: 'Sign up again on the page and use the newest email.' };
  setCell('Subscribers', r._row, 'status', 'active');
  return { title: "You're on the list", text: "You'll get an email when a new session goes up." };
}

function unsubscribe(tok) {
  var r = rows('Subscribers').filter(function (x) { return x.token === tok; })[0];
  if (r) setCell('Subscribers', r._row, 'status', 'unsubscribed');
  return { title: 'Unsubscribed', text: 'No more session emails. You can still check the page anytime.' };
}

// Deletes data that has passed its retention period (matches the privacy
// text on rechtliches.html). Runs daily together with announceNewSessions.
//   Joins: 30 days after the session · Requests: 6 months ·
//   Subscribers that never confirmed or unsubscribed: 30 days
function purgeOldData() {
  var day = 86400000, now = Date.now();
  var rules = [
    ['Joins',       function (r) { return r.start && now - new Date(r.start).getTime() > 30 * day; }],
    ['Requests',    function (r) { return r.createdAt && now - new Date(r.createdAt).getTime() > 182 * day; }],
    ['Subscribers', function (r) { return r.status !== 'active' && r.createdAt && now - new Date(r.createdAt).getTime() > 30 * day; }]
  ];
  rules.forEach(function (rule) {
    var sheet = db().getSheetByName(rule[0]);
    rows(rule[0]).filter(rule[1]).map(function (r) { return r._row; })
      .sort(function (a, b) { return b - a; })               // bottom-up, so row numbers stay valid
      .forEach(function (n) { sheet.deleteRow(n); });
  });
}

// Daily job (installed by setup): email active subscribers about sessions
// that are new within the next announceDaysAhead days.
function announceNewSessions() {
  try { purgeOldData(); } catch (e) { Logger.log('Clean-up failed: ' + e); }
  var horizon = Date.now() + C().announceDaysAhead * 86400000;
  var done = {};
  rows('Announced').forEach(function (r) { done[r.sessionId] = true; });
  var fresh = sessions().filter(function (s) { return s.start < horizon && !done[s.id]; });
  if (!fresh.length) return;

  var subs = rows('Subscribers').filter(function (r) { return r.status === 'active'; });
  var lines = fresh.map(function (s) { return whenLabel(new Date(s.start)) + ' at ' + s.gym + (s.label ? ' (' + s.label + ')' : ''); });
  subs.forEach(function (sub) {
    var unsub = ScriptApp.getService().getUrl() + '?action=unsubscribe&token=' + sub.token;
    MailApp.sendEmail({
      to: sub.email,
      subject: fresh.length === 1 ? 'New session: ' + lines[0] : fresh.length + ' new bouldering sessions',
      htmlBody: mailShell(fresh.length === 1 ? 'New session' : 'New sessions', lines.join('\n'),
        [{ href: C().pageUrl, text: 'Join on the page' }], unsub)
    });
  });
  var sh = db().getSheetByName('Announced');
  fresh.forEach(function (s) { sh.appendRow([s.id, new Date()]); });
}

/* ───────────────────────── "I'm at the gym" switch (host only) ───────────────────────── */

function checkin(body) {
  if (!isAdmin_(body.key)) return { ok: false, error: 'forbidden' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'server_busy' };
  try {
    var now = Date.now();
    closeOpenVisit(now, 'new check-in');                   // a forgotten earlier one ends now

    // explicit end time (e.g. the end of today's planned session), max 8 h;
    // otherwise "hours" like before
    var until = Number(body.until);
    if (!(until > now && until <= now + 8 * 3600000)) {
      until = now + Math.min(8, Math.max(0.5, Number(body.hours) || 2)) * 3600000;
    }
    var gym = clean(body.gym, 80), location = clean(body.location, 160) || gym;
    var effort = clean(body.effort, 40);

    // planned session running/starting now? then just log. Otherwise create
    // a calendar event so the visit shows up on the page and people can join.
    var planned = sessions().filter(function (x) { return x.start <= until && x.end > now; })[0];
    var eventId = '';
    if (!planned) {
      var start = new Date(Math.floor(now / 300000) * 300000);   // rounded down to 5 min
      var ev = calendar().createEvent(C().spontaneousTitle, start, new Date(until), { location: location });
      eventId = ev.getId();
    }

    var visitId = token();
    appendByHeader('Visits', { visitId: visitId, gym: gym, location: location, type: planned ? 'planned' : 'spontaneous',
      checkIn: new Date(now), plannedUntil: new Date(until), eventId: eventId, effort: effort });
    PropertiesService.getScriptProperties().setProperty('CHECKIN',
      JSON.stringify({ gym: gym, location: location, until: until, visitId: visitId, effort: effort }));
    return { ok: true, spontaneous: !planned };
  } finally {
    lock.releaseLock();
  }
}

function checkout(body) {
  if (!isAdmin_(body.key)) return { ok: false, error: 'forbidden' };
  closeOpenVisit(Date.now(), 'manual');
  return { ok: true };
}

// Closes the currently open visit (if any): writes check-out + minutes,
// trims a spontaneous calendar event to the real end, clears the banner.
function closeOpenVisit(at, how) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('CHECKIN');
  props.deleteProperty('CHECKIN');
  if (!raw) return;
  var c = JSON.parse(raw);
  if (!c.visitId) return;
  var v = rows('Visits').filter(function (r) { return r.visitId === c.visitId && !r.checkOut; })[0];
  if (!v) return;
  var end = Math.min(at, new Date(v.plannedUntil).getTime() || at);
  if (how === 'manual') end = at;                        // you tapped "I've left": that's the truth
  var minutes = Math.max(0, Math.round((end - new Date(v.checkIn).getTime()) / 60000));
  setCell('Visits', v._row, 'checkOut', new Date(end));
  setCell('Visits', v._row, 'minutes', minutes);
  setCell('Visits', v._row, 'closedBy', how);
  if (v.eventId) {
    try {
      var ev = calendar().getEventById(v.eventId);
      if (ev) {
        if (end - ev.getStartTime().getTime() < 10 * 60000) ev.deleteEvent();   // left right away
        else ev.setTime(ev.getStartTime(), new Date(end));
      }
    } catch (e) { Logger.log('Could not adjust the spontaneous event: ' + e); }
  }
}

/* ───────────────────────── admin dashboard (key-protected) ───────────────────────── */

// Everything the dashboard shows. Contains emails, so it's only returned
// together with the right adminKey — the public page never gets this.
function dashboard(body) {
  if (!isAdmin_(body.key)) return { ok: false, error: 'forbidden' };
  var list = sessions();
  var joins = rows('Joins');
  list.forEach(function (s) {
    s.people = joins.filter(function (j) { return j.sessionId === s.id; }).map(function (j) {
      return { name: j.name, email: j.email, status: j.status, at: j.createdAt };
    });
  });
  var requests = rows('Requests').map(function (r) {
    return { at: r.createdAt, name: r.name, email: r.email, gym: r.gym, when: r.when, note: r.note };
  }).reverse().slice(0, 100);
  var subscribers = rows('Subscribers').map(function (r) {
    return { email: r.email, name: r.name, status: r.status, at: r.createdAt };
  }).reverse();
  var visits = rows('Visits').map(function (r) {
    return { gym: r.gym, type: r.type, checkIn: r.checkIn, plannedUntil: r.plannedUntil,
             checkOut: r.checkOut || null, minutes: r.minutes === '' ? null : r.minutes, closedBy: r.closedBy,
             effort: r.effort || '' };
  }).reverse().slice(0, 200);
  return { ok: true, v: BACKEND_VERSION, now: liveNow(list), sessions: list, requests: requests, subscribers: subscribers, visits: visits };
}

// Removes every row with that email from the "Subscribers" tab (admin only).
function deleteSubscriber(body) {
  if (!isAdmin_(body.key)) return { ok: false, error: 'forbidden' };
  var email = clean(body.email, 200).toLowerCase();
  if (!email) return { ok: false, error: 'bad_request' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'server_busy' };
  try {
    var hits = rows('Subscribers').filter(function (r) { return String(r.email).toLowerCase() === email; });
    if (!hits.length) return { ok: false, error: 'not_found' };
    var sheet = db().getSheetByName('Subscribers');
    // delete from the bottom up so row numbers don't shift under us
    hits.map(function (r) { return r._row; }).sort(function (a, b) { return b - a; })
        .forEach(function (n) { sheet.deleteRow(n); });
    return { ok: true, removed: hits.length };
  } finally {
    lock.releaseLock();
  }
}

/* ───────────────────────── emails ───────────────────────── */

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function whenLabel(d) {
  var tz = Session.getScriptTimeZone();
  return Utilities.formatDate(d, tz, "EEEE d MMMM, HH:mm");
}

// Charcoal + yellow email layout. buttons: [{href, text}]
// Built with tables + bgcolor ("bulletproof buttons"): Apple Mail, Gmail and
// Outlook keep the spacing and colors, instead of gluing links together
// or turning them blue (which plain styled <a> tags suffer from).
function mailShell(title, text, buttons, unsubLink) {
  var sans = "'Avenir Next','Helvetica Neue',Arial,sans-serif";
  var cells = (buttons || []).map(function (b) {
    return '<td bgcolor="#fcba01" style="background:#fcba01;border-radius:12px;">'
      + '<a href="' + esc(b.href) + '" style="display:inline-block;padding:13px 20px;font-family:' + sans + ';'
      + 'font-size:15px;font-weight:800;line-height:1;color:#1c1b19 !important;text-decoration:none;border-radius:12px;">'
      + '<span style="color:#1c1b19;">' + esc(b.text) + '</span></a></td>';
  }).join('<td width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>');
  var buttonsRow = cells
    ? '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 0;"><tr>' + cells + '</tr></table>'
    : '';
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1c1b19" style="background:#1c1b19;">'
    + '<tr><td align="center" style="padding:36px 18px;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;">'
    + '<tr><td style="font-family:' + sans + ';color:#fff8e6;">'
    + '<h1 style="font-size:28px;font-weight:800;letter-spacing:-0.02em;margin:0 0 12px;color:#fff8e6;">' + esc(title) + '</h1>'
    + '<p style="color:#d9d2c3;line-height:1.55;font-size:15px;margin:0 0 20px;">' + esc(text).replace(/\n/g, '<br>') + '</p>'
    + buttonsRow
    + (unsubLink ? '<p style="margin:26px 0 0;font-size:12px;color:#8f8a80;">You get this because you asked for session updates. '
       + '<a href="' + esc(unsubLink) + '" style="color:#8f8a80;">Stop these emails</a></p>' : '')
    + '</td></tr></table></td></tr></table>';
}

function isAdmin_(k) { var a = C().adminKey; return !!a && String(k || '') === a; }

function notifyHost(kind, line, replyTo) {
  if (!C().hostEmail) return;
  MailApp.sendEmail({ to: C().hostEmail, replyTo: replyTo, subject: 'A Place About Falling: ' + line, body: line });
}

function sendInvite(s, name, email, tok) {
  var leaveUrl = ScriptApp.getService().getUrl() + '?action=leave&token=' + tok;
  var mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.location || s.gym);
  var text = whenLabel(new Date(s.start)) + '\n' + (s.location || s.gym) +
             '\n\nThe calendar invite is attached. Bring chalk.';
  var ics = buildICS({
    uid: s.id + '-' + tok + '@a-place-about-falling',
    title: 'Bouldering with ' + C().hostName + ' at ' + s.gym,
    location: s.location || s.gym,
    description: 'Can\'t make it? ' + leaveUrl,
    start: new Date(s.start),
    end: new Date(s.end),
    attendee: email
  });
  MailApp.sendEmail({
    to: email,
    subject: "You're in: " + whenLabel(new Date(s.start)) + ' at ' + s.gym,
    htmlBody: mailShell("See you on the wall, " + name.split(' ')[0], text,
      [{ href: mapsUrl, text: 'Directions' }, { href: leaveUrl, text: "Can't make it" }]),
    attachments: [Utilities.newBlob(ics, 'text/calendar', 'invite.ics')]
  });
}

function buildICS(o) {
  function utc(d) { return Utilities.formatDate(d, 'Etc/UTC', "yyyyMMdd'T'HHmmss'Z'"); }
  function e(t) { return String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
  function fold(line) {
    var out = [], cur = '', bytes = 0;
    Array.from(line).forEach(function (ch) {
      var b = Utilities.newBlob(ch).getBytes().length;
      if (bytes + b > 75) { out.push(cur); cur = ' '; bytes = 1; }
      cur += ch; bytes += b;
    });
    out.push(cur);
    return out.join('\r\n');
  }
  return [
    'BEGIN:VCALENDAR', 'PRODID:-//A Place About Falling//EN', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST',
    'BEGIN:VEVENT',
    'UID:' + e(o.uid), 'DTSTAMP:' + utc(new Date()), 'DTSTART:' + utc(o.start), 'DTEND:' + utc(o.end),
    'SUMMARY:' + e(o.title), 'LOCATION:' + e(o.location), 'DESCRIPTION:' + e(o.description),
    'ORGANIZER;CN=' + e(C().hostName) + ':mailto:' + C().hostEmail,
    'ATTENDEE;CN=' + e(o.attendee) + ';RSVP=TRUE:mailto:' + o.attendee,
    'STATUS:CONFIRMED', 'SEQUENCE:0',
    'END:VEVENT', 'END:VCALENDAR'
  ].map(fold).join('\r\n');
}


/* ═══════════════════════════════════════════════════════════════
   SETUP — menu in the sheet + the side panel (Setup.html) calls these.
   ═══════════════════════════════════════════════════════════════ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🧗 A Place About Falling')
    .addItem('Einrichten / Set up', 'openSetup')
    .addItem('Meine Links / My links', 'openLinks')
    .addToUi();
}

function openSetup() { showPanel('setup'); }
function openLinks() { showPanel('links'); }
function showPanel(start) {
  var t = HtmlService.createTemplateFromFile('Setup');
  t.start = start;
  SpreadsheetApp.getUi().showSidebar(t.evaluate().setTitle('A Place About Falling'));
}

// A copy of someone else's sheet carries their script settings along.
// If the settings belong to another spreadsheet, start fresh.
function resetIfCopied_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var owner = props.getProperty('SHEET_ID');
  if (ss && owner && owner !== ss.getId()) { props.deleteAllProperties(); _cfg = null; }
}

// everything the panel needs to draw itself
function getSetupState() {
  resetIfCopied_();
  var props = PropertiesService.getScriptProperties();
  var saved = {};
  try { saved = JSON.parse(props.getProperty('SETTINGS') || '{}'); } catch (e) {}
  var me = Session.getEffectiveUser().getEmail();
  var cals = CalendarApp.getAllCalendars().map(function (c) {
    return { id: c.getId(), name: c.getName(), primary: c.isMyPrimaryCalendar(), owned: c.isOwnedByMe() };
  }).sort(function (a, b) { return (b.primary - a.primary) || a.name.localeCompare(b.name); });
  var dep = props.getProperty('DEPLOYMENT_ID') || '';
  var hint = '';
  try { var u = ScriptApp.getService().getUrl() || ''; if (/\/exec$/.test(u)) hint = u; } catch (e) {}
  return {
    lang: PropertiesService.getUserProperties().getProperty('LANG') || '',
    email: me,
    saved: saved,
    calendars: cals,
    defaultGyms: DEFAULT_GYMS,
    hasSettings: !!props.getProperty('SETTINGS'),
    deploymentId: dep,
    deployHint: hint,
    links: dep ? links_() : null,
    calendarApi: typeof Calendar !== 'undefined' && !!Calendar.Freebusy,
    editorUrl: 'https://script.google.com/home/projects/' + ScriptApp.getScriptId() + '/edit'
  };
}

function setLang(lang) {
  PropertiesService.getUserProperties().setProperty('LANG', lang === 'en' ? 'en' : 'de');
  return true;
}

// "Create a bouldering calendar" button
function createBoulderCalendar(name) {
  var cal = CalendarApp.createCalendar(String(name || 'Bouldering').slice(0, 60), {
    color: CalendarApp.Color.YELLOW,
    summary: 'Sessions for A Place About Falling. Location = gym.'
  });
  return { id: cal.getId(), name: cal.getName() };
}

// Saves the panel's answers, prepares the data tabs, the daily job and the admin word.
function saveSettings(s) {
  resetIfCopied_();
  var clean1 = function (v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max); };
  var gyms = (s.gyms || []).map(function (g) {
    return { location: clean1(g.location, 40) || 'Gyms', gyms: (g.gyms || []).map(function (x) {
      return { name: clean1(x.name, 60), address: clean1(x.address, 160) };
    }).filter(function (x) { return x.name; }) };
  }).filter(function (g) { return g.gyms.length; });
  var out = {
    hostName: clean1(s.hostName, 30),
    title: clean1(s.title, 60),
    intro: clean1(s.intro, 220),
    contactName: clean1(s.contactName, 80),
    contactEmail: clean1(s.contactEmail, 200),
    calendarId: clean1(s.calendarId, 200),
    availabilityCalendarIds: (s.availabilityCalendarIds || []).map(function (x) { return clean1(x, 200); }).filter(String).slice(0, 10),
    gyms: gyms,
    hangoutUrl: /^https:\/\//.test(s.hangoutUrl || '') ? clean1(s.hangoutUrl, 300) : '',
    notifyEmail: validEmail(String(s.notifyEmail || '')) ? clean1(s.notifyEmail, 200) : ''
  };
  if (!out.hostName) throw new Error('name');
  if (!out.calendarId || !CalendarApp.getCalendarById(out.calendarId)) throw new Error('calendar');
  if (!validEmail(out.contactEmail)) throw new Error('contact');
  if (!out.gyms.length) throw new Error('gyms');

  var props = PropertiesService.getScriptProperties();
  props.setProperty('SETTINGS', JSON.stringify(out));
  props.setProperty('SHEET_ID', SpreadsheetApp.getActiveSpreadsheet().getId());
  if (!props.getProperty('ADMIN_KEY')) props.setProperty('ADMIN_KEY', adminWord_());
  _cfg = null;
  db();
  installTriggers_();
  CacheService.getScriptCache().remove('availability_v2');
  return getSetupState();
}

// two short words + a number, easy to type, hard to guess
function adminWord_() {
  var a = ['chalk', 'crimp', 'sloper', 'jug', 'pinch', 'dyno', 'heel', 'mantle', 'smear', 'flag'];
  var b = ['otter', 'gecko', 'lemur', 'capy', 'koala', 'panda', 'yak', 'lynx', 'ibis', 'moose'];
  var r = function (n) { return Math.floor(Math.random() * n); };
  return a[r(a.length)] + '-' + b[r(b.length)] + '-' + (100 + r(900)) + '-' + token().slice(0, 4);
}

function installTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'announceNewSessions'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('announceNewSessions').timeBased().everyDays(1).atHour(9).create();
}

// Step "publish": the person pastes the web app address. We check it really
// answers (catches "Who has access: Only myself" and similar).
function saveDeployment(url) {
  var m = String(url || '').trim().match(/script\.google\.com\/macros\/s\/([\w-]{20,})\/exec/);
  if (!m) return { ok: false, error: 'format' };
  var id = m[1];
  try {
    var res = UrlFetchApp.fetch('https://script.google.com/macros/s/' + id + '/exec?action=feed', { muteHttpExceptions: true, followRedirects: true });
    var body = res.getContentText();
    var j = null;
    try { j = JSON.parse(body); } catch (e) {}
    if (!j) return { ok: false, error: 'access' };          // got a Google login page instead of data
  } catch (e) {
    return { ok: false, error: 'unreachable' };
  }
  PropertiesService.getScriptProperties().setProperty('DEPLOYMENT_ID', id);
  _cfg = null;
  return { ok: true, links: links_() };
}

function links_() {
  var c = C();
  return { page: c.pageUrl, admin: c.pageUrl + '&admin=' + encodeURIComponent(c.adminKey), dashboard: c.pageUrl + '&admin=' + encodeURIComponent(c.adminKey) + '&view=dashboard', sheet: SpreadsheetApp.getActiveSpreadsheet() ? SpreadsheetApp.getActiveSpreadsheet().getUrl() : '' };
}

// "Email me my links" — lands in the person's own inbox
function emailMyLinks(lang) {
  var l = links_(), de = lang !== 'en';
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: de ? 'Deine Links: A Place About Falling' : 'Your links: A Place About Falling',
    htmlBody: mailShell(de ? 'Deine Seite ist online' : 'Your page is live',
      de ? 'Öffentlicher Link: zum Teilen mit allen.\n\nAdmin-Link: NUR für dich. Damit checkst du ein und siehst dein Dashboard. Behandle ihn wie ein Passwort.'
         : 'Public link: share it with everyone.\n\nAdmin link: ONLY for you. It lets you check in and see your dashboard. Treat it like a password.',
      [{ href: l.page, text: de ? 'Öffentliche Seite' : 'Public page' }, { href: l.admin, text: de ? 'Admin-Link' : 'Admin link' }])
  });
  return true;
}

// a new admin word (old admin links stop working)
function newAdminKey() {
  PropertiesService.getScriptProperties().setProperty('ADMIN_KEY', adminWord_());
  _cfg = null;
  return links_();
}

// quick health check for the panel's last step
function checkHealth() {
  var c = C(), out = [];
  var cal = null;
  try { cal = CalendarApp.getCalendarById(c.calendarId); } catch (e) {}
  out.push({ k: 'calendar', ok: !!cal, info: cal ? cal.getName() : '' });
  out.push({ k: 'sessions', ok: true, info: cal ? String(sessions().length) : '0' });
  out.push({ k: 'freebusy', ok: typeof Calendar !== 'undefined' && !!Calendar.Freebusy });
  out.push({ k: 'trigger', ok: ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'announceNewSessions'; }) });
  out.push({ k: 'deployed', ok: !!c.deploymentId });
  return out;
}

/* ───────────────────────── owner only: make the master sheet ready to copy ───────────────────────── */

// Run once in YOUR master sheet (Extensions → Apps Script → pick prepareTemplate → Run).
// Builds the "Start here" tab and removes any data tabs, so copies start empty.
function prepareTemplate() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (n) { var sh = ss.getSheetByName(n); if (sh) ss.deleteSheet(sh); });
  var start = ss.getSheetByName('Start here') || ss.insertSheet('Start here', 0);
  start.clear();
  ss.getSheets().forEach(function (sh) { if (sh.getName() !== 'Start here') ss.deleteSheet(sh); });
  start.setHiddenGridlines(true);
  start.setColumnWidth(1, 28); start.setColumnWidth(2, 640);
  var lines = [
    ['🧗 A Place About Falling', 'h1'],
    ['Deine eigene Boulder-Seite. Your own bouldering page.', 'sub'],
    ['', ''],
    ['DEUTSCH', 'h2'],
    ['1.  Oben im Menü auf „🧗 A Place About Falling" → „Einrichten / Set up" klicken.', ''],
    ['     (Das Menü erscheint ein paar Sekunden nach dem Öffnen. Nicht da? Seite neu laden.)', 'dim'],
    ['2.  Google fragt einmal nach Erlaubnis. „Google hat diese App nicht überprüft" ist normal,', ''],
    ['     weil es dein eigenes Skript ist: „Erweitert" → „Weiter zu …" → „Zulassen".', 'dim'],
    ['3.  Der Rest passiert in der Leiste rechts. Dauert ca. 5 Minuten.', ''],
    ['', ''],
    ['ENGLISH', 'h2'],
    ['1.  In the menu at the top: "🧗 A Place About Falling" → "Einrichten / Set up".', ''],
    ['     (It shows up a few seconds after opening. Not there? Reload the page.)', 'dim'],
    ['2.  Google asks for permission once. "Google hasn\'t verified this app" is normal,', ''],
    ['     because it\'s your own script: "Advanced" → "Go to …" → "Allow".', 'dim'],
    ['3.  Everything else happens in the panel on the right. Takes about 5 minutes.', '']
  ];
  lines.forEach(function (l, i) {
    var r = start.getRange(i + 2, 2).setValue(l[0]).setFontFamily('Arial').setWrap(false);
    if (l[1] === 'h1') r.setFontSize(26).setFontWeight('bold');
    else if (l[1] === 'sub') r.setFontSize(13).setFontColor('#6b6458');
    else if (l[1] === 'h2') r.setFontSize(11).setFontWeight('bold').setFontColor('#b98700');
    else if (l[1] === 'dim') r.setFontSize(11).setFontColor('#8b8579');
    else r.setFontSize(13);
  });
  start.getRange(1, 1, lines.length + 3, 3).setBackground('#fff8e6');
  start.setTabColor('#fcba01');
  PropertiesService.getScriptProperties().deleteAllProperties();
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('Template ready. Share link to send around: ' + ss.getUrl().replace(/\/edit.*$/, '/copy'));
}
