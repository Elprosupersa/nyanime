from curl_cffi import requests
from bs4 import BeautifulSoup
r = requests.get('https://fukou-da.net/apart/otonari-no-tenshi-sama-1212-bdrip-1080p', impersonate='chrome110')
soup = BeautifulSoup(r.text, 'html.parser')
for a in soup.find_all('a'):
    href = a.get('href', '')
    if 'http' in href and 'fukou-da.net' not in href:
        print(href)
