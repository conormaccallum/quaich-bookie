window.Quaich = (() => {
  async function fetchState() {
    const response = await fetch("/api/state");
    if (!response.ok) {
      throw new Error("Could not load book state");
    }
    return response.json();
  }

  async function sendJson(url, method, payload) {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  }

  function formatOdds(decimal, format) {
    if (!Number.isFinite(decimal) || decimal <= 1) {
      return "-";
    }
    if (format === "decimal") {
      return decimal.toFixed(2);
    }
    if (format === "american") {
      return decimal >= 2 ? `+${Math.round((decimal - 1) * 100)}` : `${Math.round(-100 / (decimal - 1))}`;
    }
    const fraction = decimalToFraction(decimal - 1);
    return `${fraction.numerator}/${fraction.denominator}`;
  }

  function autoOfferedDecimal(probability, totalProbability, marginPercent) {
    const safeProbability = Number(probability || 0);
    const safeTotal = Number(totalProbability || 0);
    const safeMargin = Number(marginPercent || 0);
    if (safeProbability <= 0 || safeTotal <= 0) {
      return 0;
    }
    const normalizedProbability = Math.max(0.0001, safeProbability / safeTotal);
    return Number((1 / (normalizedProbability * (1 + safeMargin / 100))).toFixed(2));
  }

  function decimalToFraction(value) {
    let bestNumerator = 1;
    let bestDenominator = 1;
    let bestError = Infinity;

    for (let denominator = 1; denominator <= 32; denominator += 1) {
      const numerator = Math.max(1, Math.round(value * denominator));
      const approx = numerator / denominator;
      const error = Math.abs(approx - value);
      if (error < bestError) {
        bestNumerator = numerator;
        bestDenominator = denominator;
        bestError = error;
      }
    }

    const divisor = gcd(bestNumerator, bestDenominator);
    return {
      numerator: bestNumerator / divisor,
      denominator: bestDenominator / divisor,
    };
  }

  function gcd(a, b) {
    return b ? gcd(b, a % b) : a;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function currency(value) {
    return `$${Number(value || 0).toFixed(2)}`;
  }

  function percent(value) {
    return `${Number(value || 0).toFixed(1)}%`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  return {
    fetchState,
    sendJson,
    formatOdds,
    autoOfferedDecimal,
    byId,
    currency,
    percent,
    escapeHtml,
  };
})();
