import { mediaItem } from '../../core/media-item.js';

const CLIENT_ID = '546c25a59c58ad7';

/** Pull the post id from imgur.com/a/ID, /gallery/slug-ID, /ID and i.imgur.com/ID.ext. */
function imgurIdFromUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const last = u.pathname.split('/').filter(Boolean).pop()?.replace(/\.\w+$/, '');
  const id = last?.split('-').pop();
  return id && /^[A-Za-z0-9]{5,8}$/.test(id) ? id : null;
}

async function apiGet(path, params = {}) {
  const q = new URLSearchParams({ ...params, include: 'media,tags,account' });
  const res = await fetch(`https://api.imgur.com${path}?${q}`, {
    headers: {
      Authorization: `Client-ID ${CLIENT_ID}`,
      Origin: 'https://imgur.com',
    },
  });
  if (!res.ok) throw new Error(`Imgur API HTTP ${res.status}`);
  return res.json();
}

function itemFromImage(image) {
  const media = image.media?.[0] || image;
  const ext =
    media.ext === 'jpeg' ? 'jpg' : image.is_animated && media.ext === 'gif' ? 'mp4' : media.ext || 'jpg';
  const url = `https://i.imgur.com/${image.id}.${ext}`;
  const kind = ext === 'mp4' || ext === 'webm' ? 'video' : 'image';
  return mediaItem({
    url,
    label: image.title || image.id || 'Imgur media',
    kind,
    filename: `imgur-${image.id}.${ext}`,
  });
}

export async function extractImgur(url) {
  const id = imgurIdFromUrl(url);
  if (!id) throw new Error('Not an Imgur URL');

  if (/\/a\/|gallery\//i.test(url)) {
    const album = await apiGet(`/post/v1/albums/${id}`);
    const mediaList = album?.media || album?.data?.media || [];
    return mediaList.map((entry) => itemFromImage({ ...entry, id: entry.id || entry.media_id }));
  }

  const post = await apiGet(`/post/v1/media/${id}`);
  const image = post?.media?.[0] ? { ...post, ...post.media[0], id: post.id || id } : { ...post, id };
  return [itemFromImage(image)];
}
