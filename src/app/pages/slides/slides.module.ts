import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { SwiperModule } from 'swiper/angular';
import { SlidesPageRoutingModule } from './slides-routing.module';

import { SlidesPage } from './slides.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SlidesPageRoutingModule,
    SwiperModule
  ],
  declarations: [SlidesPage]
})
export class SlidesPageModule {}
