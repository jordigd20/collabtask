import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonicSlides } from '@ionic/angular';
import SwiperCore, { Pagination, SwiperOptions } from 'swiper';
import { SwiperComponent } from 'swiper/angular';
import { NavigationBar } from '@hugotomazi/capacitor-navigation-bar';

SwiperCore.use([Pagination, IonicSlides]);

@Component({
  selector: 'app-slides',
  templateUrl: './slides.page.html',
  styleUrls: ['./slides.page.scss']
})
export class SlidesPage implements OnInit {
  @ViewChild('swiper', { static: true }) swiper?: SwiperComponent;

  slideOpts: SwiperOptions = {
    pagination: true,
    centeredSlides: true,
  };

  constructor(private router: Router) {}

  ngOnInit() {
    NavigationBar.setTransparency({ isTransparent: true });
  }

  continue() {
    if (this.swiper?.swiperRef.activeIndex === 3)
      this.router.navigate(['/intro/welcome']);

    this.swiper?.swiperRef.slideNext();
  }
}
