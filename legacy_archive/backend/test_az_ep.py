from curl_cffi import requests
from bs4 import BeautifulSoup
r = requests.get('https://www.az-animex.com/otonari-no-tenshi-sama-ni-itsunomanika-dame-ningen-ni-sareteita-ken/', impersonate='chrome110')
soup = BeautifulSoup(r.text, 'html.parser')
links = []
for a in soup.find_all('a'):
    href = a.get('href', '')
    if 'otonari-no-tenshi' in href and href != 'https://www.az-animex.com/otonari-no-tenshi-sama-ni-itsunomanika-dame-ningen-ni-sareteita-ken/':
        links.append(href)
print('\n'.join(list(set(links))))
