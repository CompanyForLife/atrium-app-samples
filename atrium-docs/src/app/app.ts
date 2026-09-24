import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IconSpriteService } from './services/icon-sprite.service';
import { FooterComponent } from './components/footer/footer.component';
import { HeaderComponent } from './components/header/header.component';

@Component({
  selector: 'atrium-docs-root',
  imports: [RouterOutlet, FooterComponent, HeaderComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  constructor() {
    inject(IconSpriteService).loadSprite();
  }
}
