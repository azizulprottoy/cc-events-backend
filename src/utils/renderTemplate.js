const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Replaces {{key}} placeholders with values from data. Dot paths reach into
// objects ({{user.username}}), and "| fallback" is used when the value is
// missing or empty ({{user.username | there}}). Missing keys with no
// fallback render as an empty string. With { html: true }, values are
// HTML-escaped so user data can't inject markup into an email.
function renderTemplate(template, data = {}, { html = false } = {}) {
  return String(template).replace(/{{\s*([\w.]+)\s*(?:\|\s*([^}]*?)\s*)?}}/g, (_, key, fallback) => {
    const value = key.split('.').reduce((obj, part) => (obj == null ? obj : obj[part]), data);
    const text = value == null || value === '' || typeof value === 'object' ? (fallback ?? '') : String(value);
    return html ? escapeHtml(text) : text;
  });
}

module.exports = renderTemplate;
