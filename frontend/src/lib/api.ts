// --- Types ---

export interface SyncStatus {
  running: boolean;
  replays_found: number;
  replays_fetched: number;
  replays_skipped: number;
  error: string | null;
}

export interface PlayerFrequency {
  name: string;
  platform: string | null;
  platform_id: string | null;
  count: number;
}

export interface PlayerConfig {
  me: string[];
  teammates: Record<string, string[]>;
}

export interface ReplaySummary {
  id: string;
  title: string | null;
  map_name: string | null;
  playlist_name: string | null;
  duration: number | null;
  date: string | null;
  blue_goals: number | null;
  orange_goals: number | null;
  overtime: boolean;
}

export interface CoreStats {
  shots: number;
  shots_against: number;
  goals: number;
  goals_against: number;
  saves: number;
  assists: number;
  score: number;
  shooting_percentage: number;
}

export interface BoostStats {
  bpm: number;
  bcpm: number;
  avg_amount: number;
  amount_collected: number;
  amount_stolen: number;
  amount_collected_big: number;
  amount_collected_small: number;
  count_collected_big: number;
  count_collected_small: number;
  time_zero_boost: number;
  time_full_boost: number;
  percent_zero_boost: number;
  percent_full_boost: number;
}

export interface MovementStats {
  avg_speed: number;
  total_distance: number;
  time_supersonic_speed: number;
  time_boost_speed: number;
  time_slow_speed: number;
  time_ground: number;
  time_low_air: number;
  time_high_air: number;
  time_powerslide: number;
  count_powerslide: number;
}

export interface PositioningStats {
  avg_distance_to_ball: number;
  avg_distance_to_ball_possession: number;
  avg_distance_to_ball_no_possession: number;
  time_defensive_third: number;
  time_neutral_third: number;
  time_offensive_third: number;
  time_defensive_half: number;
  time_offensive_half: number;
}

export interface DemoStats {
  inflicted: number;
  taken: number;
}

export interface AggregatedStats {
  games: number;
  wins: number;
  losses: number;
  core: CoreStats;
  boost: BoostStats;
  movement: MovementStats;
  positioning: PositioningStats;
  demo: DemoStats;
}

export interface PlayerStats {
  name: string;
  role: string;
  stats: AggregatedStats;
}

export interface ReplayPlayer {
  name: string;
  role: string;
  team: string;
  stats: Record<string, unknown>;
}

export interface ReplayDetail {
  id: string;
  title: string | null;
  map_name: string | null;
  date: string | null;
  duration: number | null;
  blue_goals: number | null;
  orange_goals: number | null;
  overtime: boolean;
  my_team: 'blue' | 'orange' | null;
  players: ReplayPlayer[];
}

export interface ScorelineRoleStats {
  percent_behind_ball: number;
  avg_speed: number;
  avg_distance_to_ball: number;
}

export interface ScorelineRow {
  my_goals: number;
  opp_goals: number;
  games: number;
  me: ScorelineRoleStats;
  teammates: ScorelineRoleStats | null;
  opponents: ScorelineRoleStats;
}

export interface GameAnalysisRow {
  id: string;
  date: string;
  my_goals: number;
  opp_goals: number;
  map_name: string | null;
  overtime: boolean;
  me: ScorelineRoleStats;
  teammates: ScorelineRoleStats | null;
  opponents: ScorelineRoleStats;
}

// --- Helpers ---

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function post<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function put<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

// --- API functions ---

export function ping() {
  return get<Record<string, unknown>>('/api/ping');
}

export interface BucketStatus {
  per_second: number;
  tokens_available: number;
  per_hour: number | null;
  hour_used: number;
  seconds_until_reset: number;
}

export interface RateLimitStatus {
  tier: string;
  list: BucketStatus;
  get: BucketStatus;
}

export function getRateLimits() {
  return get<RateLimitStatus>('/api/rate-limits');
}

export interface SyncParams {
  replayDateAfter?: string;
  replayDateBefore?: string;
}

export function getSyncPreview(params: SyncParams = {}) {
  const q = new URLSearchParams();
  if (params.replayDateAfter) q.set('replay-date-after', params.replayDateAfter);
  if (params.replayDateBefore) q.set('replay-date-before', params.replayDateBefore);
  const qs = q.toString();
  return get<{ total: number }>(`/api/sync/preview${qs ? '?' + qs : ''}`);
}

export function startSync(params: SyncParams = {}) {
  const q = new URLSearchParams();
  if (params.replayDateAfter) q.set('replay-date-after', params.replayDateAfter);
  if (params.replayDateBefore) q.set('replay-date-before', params.replayDateBefore);
  const qs = q.toString();
  return post<{ message: string }>(`/api/sync${qs ? '?' + qs : ''}`);
}

export function getSyncStatus() {
  return get<SyncStatus>('/api/sync/status');
}

export interface SyncLogEntry {
  id: number;
  date_after: string | null;
  date_before: string | null;
  started_at: string;
  completed_at: string | null;
  status: string;
  replays_found: number;
  replays_fetched: number;
  replays_skipped: number;
  error: string | null;
}

export function getSyncHistory(limit = 20) {
  return get<SyncLogEntry[]>(`/api/sync/history?limit=${limit}`);
}

export interface SyncCoverage {
  replay_counts: Record<string, number>;
  synced_ranges: { date_after: string | null; date_before: string | null }[];
}

export function getSyncCoverage() {
  return get<SyncCoverage>('/api/sync/coverage');
}

export function getPlayers() {
  return get<PlayerFrequency[]>('/api/players');
}

export function getPlayerConfig() {
  return get<PlayerConfig>('/api/players/config');
}

export function savePlayerConfig(config: PlayerConfig) {
  return put<{ message: string }>('/api/players/config', config);
}

export interface ReplayListParams {
  dateAfter?: string;
  dateBefore?: string;
  map?: string;
  playlist?: string;
  limit?: number;
  offset?: number;
}

export function getReplays(params: ReplayListParams = {}) {
  const q = new URLSearchParams();
  if (params.dateAfter) q.set('date-after', params.dateAfter);
  if (params.dateBefore) q.set('date-before', params.dateBefore);
  if (params.map) q.set('map', params.map);
  if (params.playlist) q.set('playlist', params.playlist);
  if (params.limit) q.set('limit', String(params.limit));
  if (params.offset) q.set('offset', String(params.offset));
  const qs = q.toString();
  return get<ReplaySummary[]>(`/api/replays${qs ? '?' + qs : ''}`);
}

export function getReplay(id: string) {
  return get<Record<string, unknown>>(`/api/replays/${encodeURIComponent(id)}`);
}

export function getMyStats() {
  return get<PlayerStats>('/api/stats/me');
}

export function getTeammateStats() {
  return get<PlayerStats[]>('/api/stats/teammates');
}

export function getOpponentStats() {
  return get<PlayerStats>('/api/stats/opponents');
}

export interface StatsReplayParams {
  limit?: number;
  offset?: number;
}

export function getStatsReplays(params: StatsReplayParams = {}) {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', String(params.limit));
  if (params.offset) q.set('offset', String(params.offset));
  const qs = q.toString();
  return get<ReplayDetail[]>(`/api/stats/replays${qs ? '?' + qs : ''}`);
}

export interface AnalysisFilterParams {
  teamSize?: number;
  excludeZeroZero?: boolean;
  minDuration?: number;
  playlists?: string[];
}

export function getScorelineStats(params: AnalysisFilterParams = {}) {
  const q = new URLSearchParams();
  if (params.teamSize != null) q.set('team-size', String(params.teamSize));
  if (params.excludeZeroZero) q.set('exclude-zero-zero', 'true');
  if (params.minDuration) q.set('min-duration', String(params.minDuration));
  if (params.playlists) for (const p of params.playlists) q.append('playlist', p);
  const qs = q.toString();
  return get<ScorelineRow[]>(`/api/stats/scoreline${qs ? '?' + qs : ''}`);
}

export function getGameAnalysis(params: AnalysisFilterParams = {}) {
  const q = new URLSearchParams();
  if (params.teamSize != null) q.set('team-size', String(params.teamSize));
  if (params.excludeZeroZero) q.set('exclude-zero-zero', 'true');
  if (params.minDuration) q.set('min-duration', String(params.minDuration));
  if (params.playlists) for (const p of params.playlists) q.append('playlist', p);
  const qs = q.toString();
  return get<GameAnalysisRow[]>(`/api/stats/games${qs ? '?' + qs : ''}`);
}

// --- Correlation ---

export interface CorrelationPoint {
  stat_value: number;
  goal_diff: number;
  won: boolean;
}

export interface CorrelationBucket {
  range_min: number;
  range_max: number;
  label: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
}

export interface RegressionLine {
  slope: number;
  intercept: number;
  r_squared: number;
}

export interface CorrelationResponse {
  stat: string;
  role: string;
  games: number;
  points: CorrelationPoint[];
  buckets: CorrelationBucket[];
  regression: RegressionLine;
}

export interface CorrelationParams extends AnalysisFilterParams {
  stat: string;
  role?: string;
}

export function getCorrelationStats(params: CorrelationParams) {
  const q = new URLSearchParams();
  q.set('stat', params.stat);
  if (params.role) q.set('role', params.role);
  if (params.teamSize != null) q.set('team-size', String(params.teamSize));
  if (params.excludeZeroZero) q.set('exclude-zero-zero', 'true');
  if (params.minDuration) q.set('min-duration', String(params.minDuration));
  if (params.playlists) for (const p of params.playlists) q.append('playlist', p);
  const qs = q.toString();
  return get<CorrelationResponse>(`/api/stats/correlation${qs ? '?' + qs : ''}`);
}
