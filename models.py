from __future__ import annotations

from pydantic import BaseModel


class PlayerConfig(BaseModel):
    me: list[str] = []
    teammates: dict[str, list[str]] = {}


class PlayerFrequency(BaseModel):
    name: str
    platform: str | None = None
    platform_id: str | None = None
    count: int


class SyncRequest(BaseModel):
    replay_date_after: str | None = None
    replay_date_before: str | None = None


class SyncStatus(BaseModel):
    running: bool
    replays_found: int = 0
    replays_fetched: int = 0
    replays_skipped: int = 0
    error: str | None = None


class SyncLogEntry(BaseModel):
    id: int
    date_after: str | None = None
    date_before: str | None = None
    started_at: str
    completed_at: str | None = None
    status: str
    replays_found: int = 0
    replays_fetched: int = 0
    replays_skipped: int = 0
    error: str | None = None


class BucketStatus(BaseModel):
    per_second: float
    tokens_available: float
    per_hour: int | None = None
    hour_used: int = 0
    seconds_until_reset: int = 0


class RateLimitStatus(BaseModel):
    tier: str
    list: BucketStatus
    get: BucketStatus


class CoreStats(BaseModel):
    shots: int = 0
    shots_against: int = 0
    goals: int = 0
    goals_against: int = 0
    saves: int = 0
    assists: int = 0
    score: float = 0
    shooting_percentage: float = 0.0


class BoostStats(BaseModel):
    bpm: float = 0.0
    bcpm: float = 0.0
    avg_amount: float = 0.0
    amount_collected: int = 0
    amount_stolen: int = 0
    amount_collected_big: int = 0
    amount_collected_small: int = 0
    count_collected_big: int = 0
    count_collected_small: int = 0
    time_zero_boost: float = 0.0
    time_full_boost: float = 0.0
    percent_zero_boost: float = 0.0
    percent_full_boost: float = 0.0


class MovementStats(BaseModel):
    avg_speed: float = 0.0
    total_distance: int = 0
    time_supersonic_speed: float = 0.0
    time_boost_speed: float = 0.0
    time_slow_speed: float = 0.0
    time_ground: float = 0.0
    time_low_air: float = 0.0
    time_high_air: float = 0.0
    time_powerslide: float = 0.0
    count_powerslide: int = 0


class PositioningStats(BaseModel):
    avg_distance_to_ball: float = 0.0
    avg_distance_to_ball_possession: float = 0.0
    avg_distance_to_ball_no_possession: float = 0.0
    time_defensive_third: float = 0.0
    time_neutral_third: float = 0.0
    time_offensive_third: float = 0.0
    time_defensive_half: float = 0.0
    time_offensive_half: float = 0.0


class DemoStats(BaseModel):
    inflicted: int = 0
    taken: int = 0


class AggregatedStats(BaseModel):
    games: int = 0
    wins: int = 0
    losses: int = 0
    core: CoreStats = CoreStats()
    boost: BoostStats = BoostStats()
    movement: MovementStats = MovementStats()
    positioning: PositioningStats = PositioningStats()
    demo: DemoStats = DemoStats()


class PlayerStats(BaseModel):
    name: str
    role: str
    stats: AggregatedStats = AggregatedStats()


class ScorelineRoleStats(BaseModel):
    percent_behind_ball: float = 0.0
    avg_speed: float = 0.0
    avg_distance_to_ball: float = 0.0


class ScorelineRow(BaseModel):
    my_goals: int
    opp_goals: int
    games: int
    me: ScorelineRoleStats
    teammates: ScorelineRoleStats | None = None
    opponents: ScorelineRoleStats


class GameAnalysisRow(BaseModel):
    id: str
    date: str
    my_goals: int
    opp_goals: int
    map_name: str | None = None
    overtime: bool = False
    me: ScorelineRoleStats
    teammates: ScorelineRoleStats | None = None
    opponents: ScorelineRoleStats


class CorrelationPoint(BaseModel):
    stat_value: float
    goal_diff: int
    won: bool


class CorrelationBucket(BaseModel):
    range_min: float
    range_max: float
    label: str
    games: int
    wins: int
    losses: int
    draws: int
    win_rate: float


class RegressionLine(BaseModel):
    slope: float
    intercept: float
    r_squared: float


class CorrelationResponse(BaseModel):
    stat: str
    role: str
    games: int
    points: list[CorrelationPoint]
    buckets: list[CorrelationBucket]
    regression: RegressionLine


class ReplaySummary(BaseModel):
    id: str
    title: str | None = None
    map_name: str | None = None
    playlist_name: str | None = None
    duration: int | None = None
    date: str | None = None
    blue_goals: int | None = None
    orange_goals: int | None = None
    overtime: bool = False


class ReplayPlayer(BaseModel):
    name: str
    role: str
    team: str  # "blue" or "orange"
    stats: dict
