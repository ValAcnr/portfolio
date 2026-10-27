// Démo Octagon Studio : Score Algo + 3 des 14 règles, sur un jeu de données entièrement fictif.
// Les formules reprennent celles de l'outil (sous-score = 100·r^1,5 / (r^1,5 + 1), r = valeur / médiane).
// Aucun appel réseau : tout est calculé dans le navigateur.
(function (global) {
  "use strict";

  // ── Jeu de données fictif, généré de façon déterministe ────────────────────
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var TITLES = [
    "Sortir d'une saisie au col", "Une soirée d'entraînement en 30 secondes", "Le jab expliqué par un coach",
    "Premier cours d'essai : ce qui t'attend", "Trois erreurs de garde fréquentes", "Échauffement du mardi",
    "Avant / après 3 mois de cours", "Le coach réagit à une vieille vidéo", "Comment chuter sans se faire mal",
    "Coulisses : préparer la salle", "Question du public : faut-il être en forme ?", "Enchaînement pieds-poings",
    "Une adhérente raconte son premier combat", "Self-défense : se dégager d'un poignet", "Le défi du gainage",
    "Sparring léger, règles de sécurité", "Pourquoi on salue avant de combattre", "Routine étirements après la séance",
    "Le cours enfants en images", "Trend : la transition en kimono", "Projection de base, au ralenti",
    "Ce que mange un coach avant l'entraînement", "Répondre à un commentaire : « c'est violent ? »",
    "Le club fête ses adhérents", "Garde haute ou garde basse ?", "Trois exercices à faire chez soi",
    "Coulisses : la playlist du cours", "Le meilleur moment de la semaine",
  ];
  var PILLARS = ["Technique", "Coulisses", "Témoignage", "Pédagogie", "Humour"];
  var FORMATS = ["Face caméra", "Tutoriel", "Montage", "Avant / après"];
  var COACHES = ["Coach 1", "Coach 2", "Coach 3"];
  var DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  var SLOTS = [
    { from: 7, to: 12, label: "matin" },
    { from: 12, to: 14, label: "midi" },
    { from: 14, to: 18, label: "après-midi" },
    { from: 18, to: 23, label: "soir" },
  ];

  function gauss(rnd) {
    var u = 1 - rnd(), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function buildDataset() {
    var rnd = mulberry32(20261027);
    return TITLES.map(function (title, i) {
      // Le club publie surtout le mardi, le jeudi et le samedi, le midi ou le soir.
      var day = [1, 1, 1, 3, 3, 3, 5, 5, 0, 2, 4, 6][Math.floor(rnd() * 12)];
      var hour = [12, 13, 12, 19, 20, 19, 18, 10, 16][Math.floor(rnd() * 9)];
      var duration = [11, 13, 18, 22, 26, 28, 35, 42, 55, 70, 85][Math.floor(rnd() * 11)];
      var subtitles = rnd() < 0.62;
      var trendingSound = rnd() < 0.3;
      // Effets cachés du jeu de démo, que les règles doivent retrouver seules.
      var q = Math.exp(gauss(rnd) * 0.35);
      if (subtitles) q *= 1.6;
      var durBonus = duration >= 15 && duration <= 30 ? 0.3 : duration > 60 ? -0.15 : 0;
      if (duration >= 15 && duration <= 30) q *= 1.3;
      var slotBoost = (day === 1 || day === 3) && hour >= 18 ? 1.9 : 1;
      var views = Math.round(1400 * Math.exp(gauss(rnd) * 0.5) * slotBoost * (0.7 + q * 0.3));
      var retention = Math.max(0.12, Math.min(0.95, 0.32 + 0.14 * q + durBonus + gauss(rnd) * 0.04));
      var rate = function (base) { return base * q * (0.85 + rnd() * 0.3) * (slotBoost > 1 ? 1.25 : 1); };
      return {
        id: "v" + (i + 1),
        title: title,
        day: day,
        hour: hour,
        pillar: PILLARS[i % PILLARS.length],
        format: FORMATS[Math.floor(rnd() * FORMATS.length)],
        coach: COACHES[Math.floor(rnd() * COACHES.length)],
        durationSec: duration,
        subtitles: subtitles,
        trendingSound: trendingSound,
        views: views,
        likes: Math.round(views * rate(0.055)),
        comments: Math.round(views * rate(0.004)),
        shares: Math.round(views * rate(0.006)),
        saves: Math.round(views * rate(0.004)),
        followersGained: Math.round(views * rate(0.0025)),
        avgWatchTimeSec: Math.round(duration * retention * 10) / 10,
        completionRate: Math.round(Math.max(3, Math.min(90, retention * 70 - 6 + gauss(rnd) * 4))),
      };
    });
  }

  // ── Métriques et Score Algo (mêmes formules que l'outil) ───────────────────
  var SIGNALS = ["retention", "shares", "saves", "followers", "comments", "likes"];
  var SIGNAL_LABELS = { retention: "Rétention", shares: "Partages", saves: "Enregistrements", followers: "Abonnés gagnés", comments: "Commentaires", likes: "Likes" };
  var DEFAULT_WEIGHTS = { retention: 35, shares: 20, saves: 15, followers: 15, comments: 10, likes: 5 };
  var EXPONENT = 1.5;

  function median(xs) {
    if (!xs.length) return null;
    var s = xs.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function mean(xs) { return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : null; }

  function signalValues(v) {
    var r = v.durationSec > 0 ? Math.min(1, v.avgWatchTimeSec / v.durationSec) : null;
    var c = v.completionRate != null ? v.completionRate / 100 : null;
    var views = Math.max(0, v.views);
    var per = function (x) { return views > 0 ? x / views : null; };
    return {
      retention: r != null && c != null ? (r + c) / 2 : (r != null ? r : c),
      shares: per(v.shares),
      saves: per(v.saves),
      followers: views > 0 ? (v.followersGained / views) * 1000 : null,
      comments: per(v.comments),
      likes: per(v.likes),
    };
  }

  function subScore(value, med) {
    if (med == null) return 50;
    if (med <= 0) return value > 0 ? 75 : 50;
    var p = Math.pow(Math.max(0, value) / med, EXPONENT);
    return (100 * p) / (p + 1);
  }

  function scoreAll(videos, weights) {
    var values = videos.map(signalValues);
    var baseline = {};
    SIGNALS.forEach(function (s) {
      baseline[s] = median(values.map(function (x) { return x[s]; }).filter(function (x) { return x != null && isFinite(x); }));
    });
    return videos.map(function (v, i) {
      var num = 0, den = 0;
      SIGNALS.forEach(function (s) {
        var val = values[i][s], w = weights[s];
        if (val == null || !isFinite(val) || w <= 0) return;
        num += subScore(val, baseline[s]) * w;
        den += w;
      });
      return Object.assign({}, v, { signals: values[i], score: den > 0 ? Math.round(num / den) : null });
    });
  }

  // ── Trois des 14 règles ────────────────────────────────────────────────────
  function durationBucket(sec) {
    if (sec < 15) return "Moins de 15 s";
    if (sec <= 30) return "15 à 30 s";
    if (sec <= 60) return "30 à 60 s";
    return "Plus d'une minute";
  }
  function slotOf(hour) {
    for (var i = 0; i < SLOTS.length; i++) if (hour >= SLOTS[i].from && hour < SLOTS[i].to) return i;
    return SLOTS.length - 1;
  }
  function groupBy(videos, keyFn) {
    var g = {};
    videos.forEach(function (v) { var k = keyFn(v); (g[k] = g[k] || []).push(v); });
    return g;
  }
  function scores(vs) { return vs.map(function (v) { return v.score; }).filter(function (x) { return x != null; }); }

  function ruleSubtitles(videos) {
    var yes = scores(videos.filter(function (v) { return v.subtitles; }));
    var no = scores(videos.filter(function (v) { return !v.subtitles; }));
    if (yes.length < 3 || no.length < 3) return null;
    var a = mean(yes), b = mean(no);
    if (a - b < 6) return null;
    return {
      priority: "moyenne", title: "Sous-titrer systématiquement",
      finding: "Avec sous-titres : Score Algo moyen " + Math.round(a) + " (" + yes.length + " vidéos) ; sans : " + Math.round(b) + " (" + no.length + " vidéos).",
      hypothesis: "Une grande partie des spectateurs regarde sans le son : sans sous-titres, ils décrochent.",
      action: "Activer les sous-titres automatiques et les corriger avant chaque publication.",
      facts: { avec: Math.round(a), sans: Math.round(b), n_avec: yes.length, n_sans: no.length },
    };
  }

  function ruleDuration(videos) {
    var all = mean(scores(videos));
    var groups = groupBy(videos, function (v) { return durationBucket(v.durationSec); });
    var best = Object.keys(groups).map(function (k) {
      var s = scores(groups[k]);
      return { label: k, count: s.length, avg: mean(s), delta: mean(s) - all };
    }).filter(function (g) { return g.count >= 4 && g.delta >= 8; })
      .sort(function (a, b) { return b.delta - a.delta; })[0];
    if (!best) return null;
    return {
      priority: "basse", title: "Viser des vidéos de " + best.label.toLowerCase(),
      finding: "Les vidéos de " + best.label.toLowerCase() + " font un Score Algo moyen de " + Math.round(best.avg) + " (" + best.count + " vidéos, +" + Math.round(best.delta) + " points).",
      hypothesis: "C'est la durée qui permet à cette audience de rester jusqu'au bout.",
      action: "Caler la durée cible des scripts de la semaine sur cette tranche.",
      facts: { tranche: best.label, score_moyen: Math.round(best.avg), ecart: Math.round(best.delta), n: best.count },
    };
  }

  function ruleSlot(videos) {
    var overall = median(scores(videos));
    var groups = groupBy(videos, function (v) { return v.day + "-" + slotOf(v.hour); });
    var best = Object.keys(groups).map(function (k) {
      var parts = k.split("-");
      return { day: +parts[0], slot: +parts[1], count: groups[k].length, med: median(scores(groups[k])) };
    }).filter(function (g) { return g.count >= 3; })
      .sort(function (a, b) { return b.med - a.med; })[0];
    if (!best || best.med - overall < 5) return null;
    var label = DAYS[best.day].toLowerCase() + " " + SLOTS[best.slot].label;
    return {
      priority: "moyenne", title: "Publier le " + label,
      finding: "Score Algo médian de " + Math.round(best.med) + " le " + label + " (" + best.count + " vidéos), contre " + Math.round(overall) + " pour l'ensemble du compte.",
      hypothesis: "C'est le moment où l'audience du club est disponible.",
      action: "Programmer les vidéos les plus importantes de la semaine sur ce créneau.",
      facts: { creneau: label, mediane_creneau: Math.round(best.med), mediane_compte: Math.round(overall), n: best.count },
    };
  }

  function analyze(videos, weights) {
    var scored = scoreAll(videos, weights).sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    var recos = [ruleSubtitles(scored), ruleDuration(scored), ruleSlot(scored)].filter(Boolean);
    var totalViews = scored.reduce(function (a, v) { return a + v.views; }, 0);
    var totalFollowers = scored.reduce(function (a, v) { return a + v.followersGained; }, 0);
    var engagement = median(scored.map(function (v) { return (v.likes + v.comments + v.shares + v.saves) / v.views; }));
    var digest = {
      club: "Club de démonstration (fictif)",
      periode: scored.length + " vidéos TikTok, juillet à septembre 2026",
      kpis: { vues: totalViews, abonnes_gagnes: totalFollowers, engagement_median: +(engagement * 100).toFixed(1) + " %" },
      ponderations_score: weights,
      top: scored.slice(0, 3).map(function (v) { return { titre: v.title, score: v.score }; }),
      flop: scored.slice(-3).reverse().map(function (v) { return { titre: v.title, score: v.score }; }),
      recommandations: recos.map(function (r) { return { titre: r.title, constat: r.finding, action: r.action, priorite: r.priority }; }),
    };
    return { videos: scored, recos: recos, digest: digest, kpis: { views: totalViews, followers: totalFollowers, engagement: engagement } };
  }

  // Texte de repli, sans IA : ce que l'outil affiche quand Claude n'est pas disponible.
  function fallbackText(a) {
    var top = a.videos[0], flop = a.videos[a.videos.length - 1];
    var lines = [
      "Sur la période, " + a.videos.length + " vidéos ont totalisé " + a.kpis.views.toLocaleString("fr-FR") + " vues et " + a.kpis.followers.toLocaleString("fr-FR") + " nouveaux abonnés.",
      "La meilleure, « " + top.title + " », obtient un Score Algo de " + top.score + " ; la moins bonne, « " + flop.title + " », " + flop.score + ".",
    ];
    if (a.recos.length) {
      lines.push("Priorités :");
      a.recos.forEach(function (r, i) { lines.push((i + 1) + ". " + r.title + ". " + r.finding); });
    } else {
      lines.push("Aucune règle ne se déclenche avec ces pondérations : les écarts ne sont pas assez nets pour conclure.");
    }
    return lines.join("\n");
  }

  var api = { buildDataset: buildDataset, analyze: analyze, fallbackText: fallbackText, DEFAULT_WEIGHTS: DEFAULT_WEIGHTS, SIGNALS: SIGNALS, SIGNAL_LABELS: SIGNAL_LABELS, durationBucket: durationBucket };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  // ── Interface ──────────────────────────────────────────────────────────────
  var data = buildDataset();
  var weights = Object.assign({}, DEFAULT_WEIGHTS);
  var fmt = function (n) { return n.toLocaleString("fr-FR"); };
  var pct = function (x) { return (x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %"; };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function scoreClass(s) { return s >= 60 ? "score hi" : s < 40 ? "score lo" : "score"; }

  function render() {
    var a = analyze(data, weights);
    document.getElementById("k-videos").textContent = a.videos.length;
    document.getElementById("k-views").textContent = fmt(a.kpis.views);
    document.getElementById("k-followers").textContent = fmt(a.kpis.followers);
    document.getElementById("k-engagement").textContent = pct(a.kpis.engagement);

    document.getElementById("rows").innerHTML = a.videos.map(function (v, i) {
      return "<tr><td class=\"num\">" + (i + 1) + "</td><td>" + esc(v.title) + "</td><td>" + esc(v.pillar) + "</td><td>" +
        esc(durationBucket(v.durationSec)) + "</td><td>" + (v.subtitles ? "oui" : "non") + "</td><td>" + DAYS[v.day].slice(0, 3) + " " + v.hour + " h</td><td class=\"num\">" +
        fmt(v.views) + "</td><td class=\"num\">" + pct(v.signals.retention) + "</td><td class=\"num\"><span class=\"" + scoreClass(v.score) + "\">" + v.score + "</span></td></tr>";
    }).join("");

    var recos = document.getElementById("recos");
    recos.innerHTML = a.recos.length ? a.recos.map(function (r) {
      return "<div class=\"reco\"><span class=\"prio\">Priorité " + r.priority + "</span><h4>" + esc(r.title) + "</h4><p>" + esc(r.finding) + "</p><p>" + esc(r.hypothesis) + "</p><p class=\"action\">→ " + esc(r.action) + "</p></div>";
    }).join("") : "<p class=\"muted\">Aucune de ces trois règles ne se déclenche avec ces pondérations : les écarts ne sont pas assez nets pour conclure. C'est voulu, l'outil préfère se taire que surinterpréter.</p>";

    document.getElementById("digest").textContent = JSON.stringify(a.digest, null, 2);
    document.getElementById("fallback").textContent = fallbackText(a);
  }

  function setupWeights() {
    var box = document.getElementById("weights");
    box.innerHTML = SIGNALS.map(function (s) {
      return "<label><span>" + SIGNAL_LABELS[s] + "</span><output id=\"o-" + s + "\">" + weights[s] + "</output>" +
        "<input type=\"range\" min=\"0\" max=\"50\" step=\"5\" value=\"" + weights[s] + "\" data-signal=\"" + s + "\" aria-label=\"Pondération " + SIGNAL_LABELS[s] + "\"></label>";
    }).join("");
    box.addEventListener("input", function (e) {
      var s = e.target.getAttribute("data-signal");
      if (!s) return;
      weights[s] = +e.target.value;
      document.getElementById("o-" + s).textContent = weights[s];
      render();
    });
    document.getElementById("reset").addEventListener("click", function () {
      weights = Object.assign({}, DEFAULT_WEIGHTS);
      box.querySelectorAll("input").forEach(function (inp) {
        var s = inp.getAttribute("data-signal");
        inp.value = weights[s];
        document.getElementById("o-" + s).textContent = weights[s];
      });
      render();
    });
  }

  function setupTabs() {
    var tabs = document.querySelectorAll("[role=tab]");
    tabs.forEach(function (t) {
      t.addEventListener("click", function () {
        tabs.forEach(function (o) {
          var on = o === t;
          o.setAttribute("aria-selected", on ? "true" : "false");
          document.getElementById(o.getAttribute("aria-controls")).hidden = !on;
        });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    setupWeights();
    setupTabs();
    render();
  });
})(this);
