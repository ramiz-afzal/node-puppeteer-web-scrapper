import puppeteer from 'puppeteer-extra';
import pluginStealth from 'puppeteer-extra-plugin-stealth';
import { executablePath } from 'puppeteer';
import dotenv from 'dotenv';
import { stringify } from 'csv-stringify';
import fs from 'fs';

// load .env variables
dotenv.config();

(async () => {
	// output file name
	let outPutDir = './results';
	let fileName = `${Date.now()}-data.csv`;
	let outPutFileName = `${outPutDir}/${fileName}`;

	let userAgentHeaders = {
		'user-agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
		'upgrade-insecure-requests': '1',
		accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
		'accept-encoding': 'gzip, deflate, br',
		'accept-language': 'en-US,en;q=0.9,en;q=0.8',
	};

	// create & open browser
	puppeteer.use(pluginStealth());
	const browser = await puppeteer.launch({ headless: false, executablePath: executablePath() });
	const page = await browser.newPage();
	await page.setExtraHTTPHeaders(userAgentHeaders);
	await page.goto(process.env.SITEMAP_ROOT_URL);
	await page.setViewport({ width: 1080, height: 1024 });

	await page.waitForSelector('loc');
	const elements = await page.$$('loc');

	const archiveURLs = [];
	for (const element of elements) {
		const text = await page.evaluate((el) => el.textContent, element);
		archiveURLs.push(text);
	}

	if (archiveURLs.length == 0) {
		await browser.close();
		console.log('No article archive URLs were found on this sitemap URL');
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
		console.log('Filter returned 0 article archive URLs for this sitemap URL');
		return;
	}

	let articleURLs = [];
	for (const archiveURL of articleArchiveURLs) {
		const _page = await browser.newPage();
		await _page.setExtraHTTPHeaders(userAgentHeaders);
		await _page.goto(archiveURL);
		await _page.setViewport({ width: 1080, height: 1024 });
		await new Promise((r) => setTimeout(r, 10000));
		await _page.waitForSelector('loc');
		const _elements = await _page.$$('loc');

		const postURLs = [];
		for (const element of _elements) {
			const text = await _page.evaluate((el) => el.textContent, element);
			postURLs.push(text);
		}

		if (postURLs.length == 0) {
			console.log(`Got empty response, URL: ${archiveURL}`);
			continue;
		}

		articleURLs.concat(postURLs);
		await _page.close();
	}

	if (articleURLs.length == 0) {
		await browser.close();
		console.log('Filter returned 0 article URLs for this sitemap URL');
		return;
	}

	let validArticleURLs = [];
	for (const url of articleURLs) {
		if (url.includes(process.env.MATCH_URL)) {
			validArticleURLs.push(url);
		}
	}

	stringify(
		validArticleURLs,
		{
			header: true,
			columns: {
				URL: 'URL',
			},
		},
		(err, output) => {
			if (err) throw err;
			fs.writeFile(outPutFileName, output, (err) => {
				if (err) throw err;
				console.log(`${outPutFileName} saved.`);
			});
		}
	);

	await browser.close();
})();
