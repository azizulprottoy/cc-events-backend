const { nanoid } = require('nanoid');

function generateApiKeyPair() {
  return {
    key: `mp_${nanoid(16)}`,
    secret: nanoid(32),
  };
}

module.exports = { generateApiKeyPair };
