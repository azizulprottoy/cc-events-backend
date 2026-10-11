// Replaces {{key}} placeholders with values from data. Missing keys render
// as an empty string rather than leaving the placeholder or throwing.
function renderTemplate(template, data = {}) {
  return String(template).replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
    const value = key.split('.').reduce((obj, part) => (obj == null ? obj : obj[part]), data);
    return value == null ? '' : String(value);
  });
}

module.exports = renderTemplate;
