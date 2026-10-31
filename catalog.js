// Known apps, in the order the dock is filled the first time.
// `match`  regex tested against the app names the TV reports (getAppsInfo)
// `ids`    Tizen or Samsung app ids to try when the TV doesn't report the app by name
// `accent` small colour dot on the tile
window.HOME_CATALOG = [
  { key: 'netflix',    name: 'Netflix',      match: '^netflix',            accent: '#e50914', ids: ['org.tizen.netflix-app', '3201907018807', '11101200001'] },
  { key: 'tizentube',  name: 'YouTube',      sub: 'No ads',  match: '^tizenbrew', accent: '#ff3b30', ids: ['xvvl3S1bvH.TizenBrewStandalone'] },
  { key: 'hulu',       name: 'Hulu',         match: '^hulu',               accent: '#1ce783', ids: ['3201601007625'] },
  { key: 'prime',      name: 'Prime Video',  match: 'prime video',         accent: '#00a8e1', ids: ['org.tizen.primevideo', '3201910019365', '3201512006785'] },
  { key: 'disney',     name: 'Disney+',      match: '^disney',             accent: '#2e5bff', ids: ['MCmYXNxgcu.DisneyPlus', '3201901017640'] },
  { key: 'max',        name: 'Max',          match: '^(hbo )?max$',        accent: '#3b5bff', ids: ['3202301029760'] },
  { key: 'appletv',    name: 'Apple TV',     match: '^apple tv',           accent: '#d9d9de', ids: ['com.samsung.tv.aria-video', '3201807016597'] },
  { key: 'plex',       name: 'Plex',         match: '^plex',               accent: '#e5a00d', ids: ['3201512006963'] },
  { key: 'youtube',    name: 'YouTube',      match: '^youtube$',           accent: '#ff3b30', ids: ['9Ur5IzDKqV.TizenYouTube', '111299001912'] },
  { key: 'youtubetv',  name: 'YouTube TV',   match: '^youtube tv',         accent: '#ff3b30', ids: ['3201707014489'] },
  { key: 'peacock',    name: 'Peacock',      match: '^peacock',            accent: '#f5c518', ids: [] },
  { key: 'paramount',  name: 'Paramount+',   match: '^paramount',          accent: '#2f6bff', ids: [] },
  { key: 'espn',       name: 'ESPN',         match: '^espn',               accent: '#e2231a', ids: [] },
  { key: 'tubi',       name: 'Tubi',         match: '^tubi',               accent: '#ff5a1f', ids: ['3201504001965'] },
  { key: 'tvplus',     name: 'Samsung TV Plus', match: 'tv plus',          accent: '#3d8bff', ids: [] },
  { key: 'spotify',    name: 'Spotify',      match: '^spotify',            accent: '#1db954', ids: ['3201606009684'] },
  { key: 'twitch',     name: 'Twitch',       match: '^twitch',             accent: '#9146ff', ids: ['3202203026841'] }
];

// Your name for the greeting. Leave empty for just "Good evening".
window.HOME_NAME = 'Aaron';
