/** Seed local browsing metadata: node scripts/seed-catalog.mjs [videos-directory] */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const videosDirectory = path.resolve(process.argv[2] ?? 'data/media/videos');
const dataDirectory = path.resolve(videosDirectory, '../..');
const databasePath = path.join(dataDirectory, 'db/node_db.sqlite');
if (!fs.existsSync(databasePath) || !fs.existsSync(videosDirectory)) {
  throw new Error(
    'Expected an existing node data directory with media/videos and db/node_db.sqlite.'
  );
}
const topics = [
  'animation',
  'architecture',
  'astronomy',
  'automotive',
  'aviation',
  'books',
  'camping',
  'cinema',
  'coding',
  'cooking',
  'crafts',
  'cycling',
  'dance',
  'design',
  'documentary',
  'education',
  'electronics',
  'fitness',
  'gaming',
  'gardening',
  'geography',
  'history',
  'hiking',
  'language',
  'makers',
  'mathematics',
  'music',
  'nature',
  'ocean',
  'painting',
  'photography',
  'podcasts',
  'robotics',
  'science',
  'space',
  'sports',
  'technology',
  'travel',
  'wildlife',
  'woodworking',
];
const keywords = ['aurora', 'orbit', 'forest', 'city'];
const marker = 'moartube-scroll-test-v1';
const db = new Database(databasePath, { timeout: 10000 });
try {
  const find = db.prepare('select meta from videos where video_id = ?');
  // Refuse to replace any existing video that does not belong to this seed.
  for (let i = 1; i <= topics.length * 48; i++) {
    const existing = find.get('Seed' + String(i).padStart(7, '0'));
    if (existing && JSON.parse(existing.meta).catalogSeed !== marker) {
      throw new Error('A seed ID is already used by another video; no records were changed.');
    }
  }
  const imageSource = fs
    .readdirSync(videosDirectory)
    .filter((name) => !name.startsWith('Seed'))
    .map((name) => path.join(videosDirectory, name, 'images/preview.jpg'))
    .filter((file) => fs.existsSync(file))
    .sort((a, b) => fs.statSync(a).size - fs.statSync(b).size)[0];
  if (!imageSource)
    throw new Error('An existing local preview.jpg is needed for the test thumbnails.');
  const backupPath = databasePath + '.before-catalog-seed.sqlite';
  if (!fs.existsSync(backupPath)) await db.backup(backupPath);
  const insert = db.prepare(`insert into videos
    (video_id, title, description, tags, length_seconds, length_timestamp, views, likes, dislikes,
     is_imported, is_published, is_finalized, outputs, meta, creation_timestamp)
    values (@video_id, @title, @description, @tags, @length_seconds, @length_timestamp, @views,
     @likes, @dislikes, 1, 1, 1, '{}', @meta, @creation_timestamp)`);
  const baseTimestamp = Date.now();
  const rows = topics.flatMap((topic, tagIndex) =>
    Array.from({ length: 48 }, (_, index) => {
      const number = tagIndex * 48 + index + 1;
      const seconds = 60 + ((number * 37) % 1800);
      return {
        video_id: 'Seed' + String(number).padStart(7, '0'),
        title: `Seed ${topic}: ${keywords[index % keywords.length]} session ${String(index + 1).padStart(2, '0')}`,
        description: `Local catalog scrolling test. Topic: ${topic}. Search keywords: ${keywords[index % keywords.length]}. Entry ${index + 1} of 48. Metadata and preview only; no playable video file.`,
        tags: 'test-' + topic,
        length_seconds: seconds,
        length_timestamp: Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'),
        views: (number * 7919) % 100000,
        likes: (number * 43) % 1000,
        dislikes: number % 17,
        meta: JSON.stringify({ catalogSeed: marker }),
        creation_timestamp: baseTimestamp - (index * 41 + tagIndex) * 3600000,
      };
    })
  );
  // Files are additive; rerunning the script leaves existing files and records intact.
  for (const row of rows) {
    const directory = path.join(videosDirectory, row.video_id);
    const images = path.join(directory, 'images');
    fs.mkdirSync(images, { recursive: true });
    for (const name of ['preview.jpg', 'thumbnail.jpg', 'poster.jpg']) {
      const target = path.join(images, name);
      if (!fs.existsSync(target)) fs.copyFileSync(imageSource, target, fs.constants.COPYFILE_EXCL);
    }
    const metadata = path.join(directory, 'seed-metadata.json');
    if (!fs.existsSync(metadata))
      fs.writeFileSync(metadata, JSON.stringify(row, null, 2) + '\n', { flag: 'wx' });
  }
  let added = 0;
  db.transaction(() => {
    for (const row of rows) {
      if (!find.get(row.video_id)) {
        insert.run(row);
        added++;
      }
    }
  })();
  console.log(
    JSON.stringify(
      {
        added,
        totalSeedEntries: rows.length,
        tags: topics.length,
        videosPerTag: 48,
        videosDirectory,
        backupPath,
        searchExamples: ['seed', 'aurora', 'orbit', 'forest', 'city'],
      },
      null,
      2
    )
  );
} finally {
  db.close();
}
