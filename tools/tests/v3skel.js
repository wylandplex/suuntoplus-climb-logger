// END-FOLD: the shipped data.json no longer seeds a v3 container (a v3 store may only ever
// come from a real fold — update-wipe detectability). Tests that model a CANONICAL post-fold
// user build their fixture from this helper, in exactly the shape ext16/ext11 write it.
module.exports = function v3skel() {
  var skel = { v: 3, g: 0, u: 1 }, g, p;
  for (g = 0; g < 10; g++) { skel['s' + g] = [0, 0, 0, 0, 0, -1]; p = {}; p[20] = ''; skel['p' + g] = p; }
  return skel;
};
