import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import { stringify } from 'csv-stringify';
import fs from 'fs';

// load .env variables
dotenv.config();

(async () => {

    // create & open browser
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto(process.env.SITEMAP_ROOT_URL);
    await page.setViewport({ width: 1080, height: 1024 });

    await page.waitForSelector('loc');
    const elements = await page.$$('loc');

    const archiveURLs = [];
    for (const element of elements) {
        const text = await page.evaluate(el => el.textContent, element);
        archiveURLs.push(text);
    }

    if (archiveURLs.length == 0) {
        await browser.close();
        console.log('No article archive URLs were found on this sitemap URL')
        return;
    }

    let articleArchiveURLs = [];
    for (const archiveURL of archiveURLs) {
        if (archiveURL.includes(process.env.MATCH_CONTENT)) {
            articleArchiveURLs.push(archiveURL);
        }
    }

    if (articleArchiveURLs.length == 0) {
        await browser.close();
        console.log('Filter returned 0 article archive URLs for this sitemap URL')
        return;
    }

    let articleURLs = [];
    for (const archiveURL of articleArchiveURLs) {
        const _page = await browser.newPage();
        await _page.goto(archiveURL);
        await _page.setViewport({ width: 1080, height: 1024 });
        await _page.waitForTimeout(3000);
        await _page.waitForSelector('loc');
        const _elements = await _page.$$('loc');

        const postURLs = [];
        for (const element of _elements) {
            const text = await _page.evaluate(el => el.textContent, element);
            postURLs.push(text);
        }

        if (postURLs.length == 0) {
            console.log(`Got empty response, URL: ${archiveURL}`)
            continue;
        }

        articleURLs.concat(postURLs);
        await _page.close();
    }

    if (articleURLs.length == 0) {
        await browser.close();
        console.log('Filter returned 0 article URLs for this sitemap URL')
        return;
    }

    let validArticleURLs = [];
    for (const url of articleURLs) {
        if (url.includes(process.env.MATCH_URL)) {
            validArticleURLs.push(url);
        }
    }

    // TODO Generate proper output file's filename
    // TODO Save in results folder

    stringify(validArticleURLs, {
        header: true, columns: {
            URL: 'URL',
        }
    }, (err, output) => {
        if (err) throw err;
        fs.writeFile('my.csv', output, (err) => {
            if (err) throw err;
            console.log('my.csv saved.');
        });
    });

    await browser.close();
})();