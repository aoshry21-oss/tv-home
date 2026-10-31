// Streaming services, in the order the shelf is filled the first time.
//
// `ids`    app ids, tried in order when launching. These are MATCHED FIRST, before `match`,
//          so an exact id always wins over a loose name. The ones marked "verified" were read
//          straight off the TV (http://192.168.1.242:8001/api/v2/applications/<id>) on
//          2026-10-31, so they are known good on this set.
// `match`  regex against the names the TV reports, used only when no id matched.
// `accent` the app's colour: the tile wash and the bar along its bottom.
// `shelf`  false keeps it out of the default shelf — still reachable from All apps.
window.HOME_CATALOG = [
  { key: 'netflix',   name: 'Netflix',     match: '^netflix$',       accent: '#e50914', logo: 'netflix', ids: ['11101200001', 'org.tizen.netflix-app', '3201907018807'] },           // verified 11101200001
  { key: 'prime',     name: 'Prime Video', match: '^prime video$',   accent: '#00a8e1', logo: 'prime', light: true, ids: ['3201512006785', 'org.tizen.primevideo', '3201910019365'] },          // verified 3201512006785
  { key: 'disney',    name: 'Disney+',     match: '^disney\\+$',     accent: '#0a68f5', logo: 'disney', light: true, ids: ['MCmYXNxgcu.DisneyPlus', '3201901017640'] },                          // verified — note ^disney alone also caught DisneyNOW
  { key: 'hulu',      name: 'Hulu',        match: '^hulu$',          accent: '#1ce783', logo: 'hulu', ids: ['3201601007625'] },                                                   // verified
  { key: 'max',       name: 'Max',         match: '^(hbo ?)?max$',   accent: '#002be7', logo: 'max', light: true, ids: ['3202301029760', '3201601007230'] },                                  // verified both
  { key: 'appletv',   name: 'Apple TV',    match: '^apple tv',       accent: '#d9d9de', logo: 'appletv', light: true, ids: ['3201807016597', 'com.samsung.tv.aria-video'] },                      // verified 3201807016597
  { key: 'youtube',   name: 'YouTube',     match: '^youtube$',       accent: '#ff0033', logo: 'youtube', ids: ['111299001912', '9Ur5IzDKqV.TizenYouTube'] },                         // verified both
  { key: 'youtubetv', name: 'YouTube TV',  match: '^youtube tv',     accent: '#ff0033', ids: ['3201707014489'] },                                                   // verified
  { key: 'tubi',      name: 'Tubi',        match: '^tubi',           accent: '#ff5a1f', ids: ['3201504001965'] },                                                   // verified

  // Not streaming, so kept off the shelf by default.
  { key: 'spotify',   name: 'Spotify',     match: '^spotify',        accent: '#1db954', ids: ['3201606009684'], shelf: false },                                     // verified
  { key: 'tizenbrew', name: 'TizenBrew',   match: '^tizenbrew',      accent: '#c9a27a', ids: ['xvvl3S1bvH.TizenBrewStandalone'], shelf: false },                    // verified

  // Not installed on this TV right now, but harmless to keep: they simply never match.
  { key: 'plex',      name: 'Plex',        match: '^plex',           accent: '#e5a00d', ids: ['3201512006963'] },
  { key: 'peacock',   name: 'Peacock',     match: '^peacock',        accent: '#f5c518', ids: [] },
  { key: 'paramount', name: 'Paramount+',  match: '^paramount',      accent: '#0064ff', ids: [] },
  { key: 'espn',      name: 'ESPN',        match: '^espn',           accent: '#e2231a', ids: [] },
  { key: 'twitch',    name: 'Twitch',      match: '^twitch',         accent: '#9146ff', ids: ['3202203026841'] }
];

// Live weather, from Open-Meteo (no account, no API key).
// `place` is looked up once and the coordinates remembered. Put your own town here.
// Set lat/lon directly to skip the lookup, or clear `place` to hide the weather entirely.
// units: 'fahrenheit' or 'celsius'.
// `place` is what gets geocoded; `label` is only what the sign reads, so the two can differ.
window.HOME_WEATHER = { place: 'Manhattan', label: 'New York City', units: 'fahrenheit' };

// Your name for the greeting. Leave empty for just "Good evening".
window.HOME_NAME = 'Aaron';
