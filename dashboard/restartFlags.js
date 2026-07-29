(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.RestartFlags = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const pad = value => String(value).padStart(2, "0");

    function formatRestartFlagParts(value) {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) return { date: "UNKNOWN", time: "UNKNOWN" };
        return {
            date: `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`,
            time: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
        };
    }

    function containsPoint(box, x, y) {
        return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    }

    function layoutRestartFlags(markers, options) {
        const area = options.chartArea;
        const start = Number(options.startMs);
        const end = Number(options.endMs);
        const duration = end - start;
        if (!area || !(duration > 0)) return [];
        const inspector = options.variant === "inspector";
        const flagWidth = Math.max(1, Math.min(inspector ? 178 : 88, area.width));
        const flagHeight = Math.max(1, Math.min(inspector ? 40 : 48, Math.max(1, area.height - 6)));
        const gap = 5;
        const laneGap = 4;
        const maximumLanes = Math.max(1, Math.floor((area.height - 4) / (flagHeight + laneGap)));
        const lanes = Array.from({ length: maximumLanes }, () => []);

        return (markers || []).map((marker, index) => {
            const timestamp = Date.parse(marker.restartAt || marker.timestamp);
            if (!Number.isFinite(timestamp) || timestamp < start || timestamp > end) return null;
            const x = area.left + ((timestamp - start) / duration) * area.width;
            const opensLeft = x + gap + flagWidth > area.right;
            const preferredLeft = opensLeft ? x - gap - flagWidth : x + gap;
            const clampLeft = value => Math.max(area.left, Math.min(area.right - flagWidth, value));
            const candidates = [
                preferredLeft,
                preferredLeft - flagWidth * 0.55,
                preferredLeft + flagWidth * 0.55,
                preferredLeft - flagWidth * 1.1,
                preferredLeft + flagWidth * 1.1
            ].map(clampLeft).filter((value, position, all) => all.indexOf(value) === position);

            let selectedLane = 0;
            let left = clampLeft(preferredLeft);
            let smallestOverlap = Infinity;
            for (let lane = 0; lane < maximumLanes; lane += 1) {
                for (const candidate of candidates) {
                    const overlap = lanes[lane].reduce((total, box) =>
                        total + Math.max(0, Math.min(candidate + flagWidth, box.right) - Math.max(candidate, box.left)), 0);
                    if (overlap < smallestOverlap) {
                        smallestOverlap = overlap;
                        selectedLane = lane;
                        left = candidate;
                    }
                    if (overlap === 0) break;
                }
                if (smallestOverlap === 0) break;
            }
            const top = area.top + 3 + selectedLane * (flagHeight + laneGap);
            const flag = { left, top, right: left + flagWidth, bottom: top + flagHeight };
            lanes[selectedLane].push(flag);
            const line = { left: x - 8, right: x + 8, top: area.top, bottom: area.bottom };
            const diamond = { left: x - 9, right: x + 9, top: area.top + 1, bottom: area.top + 19 };
            return { marker, index, timestamp, x, lane: selectedLane, opensLeft, flag, line, diamond };
        }).filter(Boolean);
    }

    function hitTestRestartFlags(hitboxes, x, y) {
        return (hitboxes || []).find(hitbox =>
            containsPoint(hitbox.flag, x, y)
            || containsPoint(hitbox.diamond, x, y)
            || containsPoint(hitbox.line, x, y)
        ) || null;
    }

    function drawRestartFlags(context, hitboxes, options = {}) {
        const inspector = options.variant === "inspector";
        context.save();
        hitboxes.forEach(hitbox => {
            const { date, time } = formatRestartFlagParts(hitbox.timestamp);
            context.save();
            context.strokeStyle = "#ff4d4d";
            context.fillStyle = "#ff4d4d";
            context.lineWidth = 1.5;
            context.beginPath();
            context.moveTo(hitbox.x, options.chartArea.top);
            context.lineTo(hitbox.x, options.chartArea.bottom);
            context.stroke();
            context.translate(hitbox.x, options.chartArea.top + 10);
            context.rotate(Math.PI / 4);
            context.fillRect(-5, -5, 10, 10);
            context.restore();

            const box = hitbox.flag;
            context.fillStyle = "rgba(2, 4, 3, 0.94)";
            context.strokeStyle = "#ff4d4d";
            context.lineWidth = 1;
            context.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
            context.strokeRect(box.left + 0.5, box.top + 0.5, box.right - box.left - 1, box.bottom - box.top - 1);
            context.fillStyle = "#f8fafc";
            context.textBaseline = "top";
            context.font = inspector ? "bold 11px monospace" : "bold 10px monospace";
            if (inspector) {
                context.fillStyle = "#ff6b6b";
                context.fillText(`RESTART // ${date}`, box.left + 5, box.top + 6);
                context.fillStyle = "#f8fafc";
                context.fillText(time, box.left + 5, box.top + 22);
            } else {
                context.fillStyle = "#ff6b6b";
                context.fillText("RESTART", box.left + 5, box.top + 4);
                context.fillStyle = "#f8fafc";
                context.fillText(date, box.left + 5, box.top + 18);
                context.fillText(time, box.left + 5, box.top + 32);
            }
        });
        context.restore();
    }

    return {
        formatRestartFlagParts,
        layoutRestartFlags,
        hitTestRestartFlags,
        drawRestartFlags
    };
});
