const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeExtensions() {
  try {
    const { data } = await axios.get('https://geminicli.com/extensions');
    const $ = cheerio.load(data);
    const extensions = [];

    $('.extension-card').each((i, el) => {
      const id = $(el).attr('data-extension-id');
      const name = $(el).find('.extension-name').text().trim();
      const description = $(el).find('.extension-description').text().trim();
      const fullName = $(el).find('.extension-card__subtitle').text().trim().replace('@', '');
      
      // Find the corresponding dialog for the install link
      const dialog = $(`#dialog-${id}`);
      const installCmd = dialog.find('.gemini-codesnip').text().trim();
      const githubUrl = dialog.find('.extension-dialog__github-link').attr('href');
      const avatar = $(el).find('.extension-card__avatar').attr('src');

      extensions.push({
        id,
        name,
        description,
        fullName,
        installUrl: githubUrl,
        avatar
      });
    });

    fs.writeFileSync('available_extensions.json', JSON.stringify(extensions, null, 2));
    console.log(`Successfully scraped ${extensions.length} extensions.`);
  } catch (err) {
    console.error('Error scraping extensions:', err);
  }
}

scrapeExtensions();
