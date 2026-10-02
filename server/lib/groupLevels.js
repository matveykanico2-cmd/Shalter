const LEVEL_THRESHOLDS = [10, 50, 200, 500, 1500, 5000];

function levelForPoints(points) {
  return LEVEL_THRESHOLDS.filter((t) => points >= t).length;
}

module.exports = { LEVEL_THRESHOLDS, levelForPoints };
