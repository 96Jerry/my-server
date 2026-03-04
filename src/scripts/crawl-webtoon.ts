import fs from 'fs/promises';
import path from 'path';

interface TitleInfo {
  titleId: number;
  titleName: string;
}

interface WebtoonData extends TitleInfo {
  favoriteCount: number;
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTitleList(): Promise<TitleInfo[]> {
  const url = 'https://comic.naver.com/api/webtoon/titlelist/weekday';
  console.log(`Fetching webtoon title list from ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch title list: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  
  const titleMap = new Map<number, TitleInfo>();
  
  if (data.titleListMap) {
    for (const [weekday, list] of Object.entries(data.titleListMap)) {
      if (Array.isArray(list)) {
        for (const item of list) {
          if (!titleMap.has(item.titleId)) {
            titleMap.set(item.titleId, {
              titleId: item.titleId,
              titleName: item.titleName,
            });
          }
        }
      }
    }
  }

  const titles = Array.from(titleMap.values());
  console.log(`Found ${titles.length} unique webtoons.`);
  return titles;
}

async function fetchFavoriteCount(titleId: number): Promise<number | null> {
  const url = `https://comic.naver.com/api/article/list/info?titleId=${titleId}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch info for titleId ${titleId}: ${response.status}`);
      return null;
    }
    const data = await response.json();
    return data.favoriteCount;
  } catch (error) {
    console.error(`Error fetching info for titleId ${titleId}:`, error);
    return null;
  }
}

async function runCrawler() {
  try {
    const titles = await fetchTitleList();
    const results: WebtoonData[] = [];

    console.log(`Fetching favorite counts for each webtoon (this might take a few minutes)...`);
    
    // Fetch sequentially to avoid rate limiting
    for (let i = 0; i < titles.length; i++) {
      const title = titles[i];
      if (i % 50 === 0 && i !== 0) {
        console.log(`Progress: ${i} / ${titles.length}`);
      }
      
      const favoriteCount = await fetchFavoriteCount(title.titleId);
      if (favoriteCount !== null) {
        results.push({
          ...title,
          favoriteCount,
        });
      }
      
      // Delay (e.g., 50ms) to be polite to the server
      await delay(50);
    }

    console.log(`Finished fetching data. Sorting...`);
    // Sort by favorite count descending
    results.sort((a, b) => b.favoriteCount - a.favoriteCount);

    // Prepare text output
    const lines = results.map((item, index) => {
      // Format with commas for better readability (e.g. 1,000,000)
      const formattedCount = item.favoriteCount.toLocaleString('en-US');
      return `${String(index + 1).padStart(4, ' ')}. ${item.titleName} (찜: ${formattedCount})`;
    });

    // Save to file
    const rootDir = process.cwd();
    const dataDir = path.join(rootDir, 'data');
    
    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
    }

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    
    const fileName = `webtoon_favorites_${yyyy}${mm}${dd}.txt`;
    const filePath = path.join(dataDir, fileName);

    const fileContent = `네이버 웹툰 찜 순위 (${yyyy}-${mm}-${dd})\n=====================================\n\n` + lines.join('\n');
    
    await fs.writeFile(filePath, fileContent, 'utf-8');
    console.log(`\nSuccess! Saved to ${filePath}`);

  } catch (err) {
    console.error('Crawler failed:', err);
    process.exit(1);
  }
}

runCrawler();
