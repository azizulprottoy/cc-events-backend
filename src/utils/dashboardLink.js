const { nanoid } = require('nanoid');

function generateDashboardLinkToken() {
  return `dl_${nanoid(32)}`;
}

module.exports = { generateDashboardLinkToken };
