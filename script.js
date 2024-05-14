import puppeteer from 'puppeteer-extra';
import pluginStealth from 'puppeteer-extra-plugin-stealth';
import { executablePath } from 'puppeteer';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import { exit } from 'process';

// load .env variables
dotenv.config();

/**
 * @param {string} fileName
 * @param {string} contents
 * @param {string} [extension='txt']
 * @returns {boolean} status
 */
async function saveAsFile(fileName, contents, extension = 'txt') {
	if (!fileName || !contents || !extension) {
		return false;
	}

	if (!fs || typeof fs.writeFile !== 'function') {
		return false;
	}

	// sanitize file name
	fileName = fileName
		.replace(/[^a-z0-9]/gi, '_')
		.toLowerCase()
		.trim();

	// sanitize file extension
	extension.replace('.', '').trim();

	let outPutDir = './results';
	let outPutFileName = `${outPutDir}/${fileName}.${extension}`;

	await fs.writeFile(outPutFileName, contents);

	return true;
}

/**
 * @param {string} fileName
 * @returns {string[]|bool} data
 */
async function readFileAsCSV(fileName) {
	if (!fileName) {
		return false;
	}

	if (!fs || typeof fs.readFile !== 'function') {
		return false;
	}

	let inPutDir = './source';
	let inPutFileName = `${inPutDir}/${fileName}`;
	let data = await fs.readFile(inPutFileName, 'utf-8');
	return data.split('\n');
}

/**
 *
 */
async function scrapeData() {
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

	// save result sets
	let _articleArchiveURLs = '';
	for (const archiveURL of articleArchiveURLs) {
		_articleArchiveURLs += archiveURL + ',\n';
	}
	await saveAsFile(`${Date.now()}-article-archive-urls`, _articleArchiveURLs, 'csv');

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

		// save result sets
		let _postURLs = '';
		for (const postURL of postURLs) {
			_postURLs += postURL + ',\n';
		}
		await saveAsFile(`${Date.now()}-${archiveURL}-urls`, _postURLs, 'csv');

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

	// save result sets
	let _validArticleURLs = '';
	for (const url of validArticleURLs) {
		_validArticleURLs += url + ',\n';
	}
	await saveAsFile(`${Date.now()}-article-urls`, _validArticleURLs, 'csv');

	// end
	await browser.close();
}

/**
 *
 */
async function scrapeDataV2() {
	let userAgentHeaders = {
		'user-agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
		'upgrade-insecure-requests': '1',
		accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
		'accept-encoding': 'gzip, deflate, br',
		'accept-language': 'en-US,en;q=0.9,en;q=0.8',
	};

	let data = await readFileAsCSV('sitemap.csv');
	if (!data || data.length == 0) {
		console.log('Source file returned empty data');
		exit();
	}

	// create & open browser
	puppeteer.use(pluginStealth());
	const browser = await puppeteer.launch({ headless: false, executablePath: executablePath() });
	for (const url of data) {
		const page = await browser.newPage();
		await page.setExtraHTTPHeaders(userAgentHeaders);
		await page.goto(url, { timeout: 0, waitUntil: 'networkidle0' });
		await page.setViewport({ width: 1080, height: 1024 });
		const pageXML = await page.content();
		await new Promise((r) => setTimeout(r, 10000));

		await saveAsFile(`${Date.now()}-${url}-raw-urls`, pageXML, 'xml');
		await page.close();
	}
	await browser.close();
}

(async () => {
	await scrapeDataV2();
})();
