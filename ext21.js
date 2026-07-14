function(op, b, rA, rB, P) {
  var i = b[0], a = rA[i], s = Math.floor(a / 1e5) % 10, c = Math.floor(a / 1e4) % 10, v = -1;
  if (op === 2) {
    b[1] = 0;
    if (i < rA.length) {
      if (c > 0) {
        var p = c - 1;
        if (P[p] > 0) P[p]--;
        if (s && P[p + 5] > 0) { P[p + 5]--; if (!P[p + 5]) P[p + 10] = 0; }
        if (P[p] <= 0) { P[p] = P[p + 5] = P[p + 10] = 0; P[p + 15] = -1; }
        b[4] = 1;
      }
      var h = a % 1e4;
      if (h > 0) b[2] = Math.max(0, b[2] - h);
      rA.splice(i, 1); rB.splice(i, 1);
      if (b[3] > 1) b[3]--;
      if (b[0] >= rA.length && rA.length > 0) b[0] = rA.length - 1;
    }
    return;
  }
  if (op === 1) {
    if (b[1]) { b[1] = 0; v = 1; }
    else if (s) v = 0;
    else { b[1] = 1; return; }
  } else {
    v = s ? 0 : 1; b[5] = v;
  }
  rA[i] = a + (v - s) * 1e5;
  if (c > 0) {
    var q = c - 1;
    if (v) { P[q + 5]++; var d = Math.floor(rB[i] / 1000); if (d > 0 && (P[q + 10] === 0 || d < P[q + 10])) P[q + 10] = d; }
    else if (P[q + 5] > 0) { P[q + 5]--; if (!P[q + 5]) P[q + 10] = 0; }
    b[4] = 1;
  }
}
