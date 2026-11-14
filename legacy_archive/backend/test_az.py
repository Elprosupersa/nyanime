from curl_cffi import requests
from bs4 import BeautifulSoup
r = requests.get('https://www.az-animex.com/?s=otonari', impersonate='chrome110')
soup = BeautifulSoup(r.text, 'html.parser')
for h3 in soup.find_all(['h2', 'h3']):
    a = h3.find('a')
    if a:
        print("Title:", a.text.strip())
        print("Link:", a['href'])
