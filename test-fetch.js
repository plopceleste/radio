const limit = 50;
const pageNum = 0;
const params = { keyword: '', tag: '', country: 'France', order: 'clickcount', hidebroken: true };

const searchArgs = new URLSearchParams({
    limit: limit.toString(),
    offset: (pageNum * limit).toString(),
    reverse: 'true',
    hidebroken: params.hidebroken ? 'true' : 'false'
});
if (params.keyword) searchArgs.set('name', params.keyword);
if (params.tag) searchArgs.set('tag', params.tag);
if (params.country) searchArgs.set('country', params.country);
if (params.order) searchArgs.set('order', params.order);
if (!params.keyword && !params.tag && !params.country) searchArgs.set('name', '');

const url = `https://de1.api.radio-browser.info/json/stations/search?${searchArgs.toString()}`;
console.log(url);
fetch(url, { headers: { 'Accept': 'application/json' } })
  .then(res => res.json())
  .then(data => console.log('Items:', data.length))
  .catch(console.error);
