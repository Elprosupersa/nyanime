from curl_cffi import requests
from bs4 import BeautifulSoup

url = "https://fukou-da.net/?s=otonari"
r = requests.get(url, impersonate="chrome110", timeout=10)
soup = BeautifulSoup(r.text, 'html.parser')

print(soup.title.text)
# Let's find links inside the main content or just print titles
posts = soup.find_all('h2')
for p in posts:
    a_tag = p.find('a')
    if a_tag:
        print(f"H2: {a_tag.text.strip()}")
        print(f"Link: {a_tag['href']}")
