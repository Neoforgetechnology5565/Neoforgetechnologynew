/** Sports analytics shown on the Services page. Honest labelling: only the sports with a working demonstration are marked as such. */
export interface Sport { name: string; demo?: { href: string; label: string } }
export const SPORTS: Sport[] = [
  { name: "Football (soccer)", demo: { href: "/ai-demos/sports-video-intelligence", label: "Football video intelligence demo" } },
  { name: "Table tennis", demo: { href: "/ai-demos/ai-table-tennis-video-intelligence", label: "Table tennis demo" } },
  { name: "Basketball", demo: { href: "/ai-demos/ai-basketball-video-intelligence", label: "Basketball demo" } },
  { name: "Padel" }, { name: "Tennis (court tennis and ball-tennis variants)" }, { name: "Volleyball" }, { name: "Beach volleyball" }, { name: "Handball" },
  { name: "Badminton" }, { name: "Squash" }, { name: "Pickleball" }, { name: "Futsal" }, { name: "Rugby" }, { name: "Field hockey" }, { name: "Ice hockey" },
  { name: "Cricket" }, { name: "Baseball" }, { name: "American football" }, { name: "Water polo" }, { name: "Netball" },
];
export const SPORT_CAPABILITIES: [string, string][] = [
  ["Player and ball tracking", "Detect and follow players and the ball through match video, with the gaps shown honestly where the ball cannot be seen."],
  ["Court and pitch mapping", "Calibrate the playing area from reference points so positions on screen become positions on the court or pitch."],
  ["Heat maps and movement", "Where each player or team spends time, distances covered and movement patterns, from real tracks."],
  ["Events for human review", "Candidate possessions, rallies, shots, serves or entries into an area, listed for a coach or analyst to confirm."],
  ["Match review tools", "Annotation, clip lists, tags and exports so analysts can work through a game quickly."],
];
