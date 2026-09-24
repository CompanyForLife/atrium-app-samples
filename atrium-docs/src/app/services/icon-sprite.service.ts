import { DOCUMENT, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class IconSpriteService {
    private document = inject(DOCUMENT);
    private platformId = inject(PLATFORM_ID);

    private loaded = false;

    loadSprite(): void {
        if (this.loaded || !isPlatformBrowser(this.platformId)) {
            return;
        }
        this.loaded = true;

        fetch('assets/images/svg/svg-symbols.svg')
            .then(response => response.text())
            .then(svgs => {
                const div = this.document.createElement('div');
                div.className = 'symbols--hide';
                div.innerHTML = svgs;
                this.document.body.prepend(div);
            });
    }
}
