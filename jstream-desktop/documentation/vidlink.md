# VIDLINK API DOCUMENTATION

Api Documentation

Embed Movies

**TmdbId is required from** [The Movie Database](https://developer.themoviedb.org/docs/getting-started) **API.**

```
https://vidlink.pro/movie/{tmdbId}
```

**Code Example:**

```
<iframe src="https://vidlink.pro/movie/786892" frameborder="0" allowfullscreen ></iframe>
```


Embed Shows

**TmdbId is required from** [The Movie Database](https://developer.themoviedb.org/docs/getting-started)API. season and episode number should not be empty.

```
https://vidlink.pro/tv/{tmdbId}/{season}/{episode}
```

**Code Example:**

```
<iframe src="https://vidlink.pro/tv/94997/1/1" frameborder="0" allowfullscreen ></iframe>
```

Embed Anime**New**

**MyAnimeList id is required from** [MyAnimeList](https://myanimelist.net/)API. number and type should not be empty.

```
https://vidlink.pro/anime/{MALid}/{number}/{subOrDub}
```

**Add ?fallback=true to force fallback to sub and vice versa if the type you set was not found.**

```
https://vidlink.pro/anime/{MALid}/{number}/{subOrDub}?fallback=true
```

**Code Example:**

```
<iframe src="https://vidlink.pro/anime/5/1/sub" frameborder="0" allowfullscreen ></iframe>
```


Customization Parameters

**You can customize the embedded media player by appending parameters to the URL. Each parameter should start with a ? and multiple parameters should be separated by &.**Use [Hex Color Codes](https://htmlcolorcodes.com/color-picker/)and remove the '#' before applying.**primaryColor**

Sets the primary color of the player, including sliders and autoplay controls.

```
primaryColor=B20710
```


**secondaryColor**

Defines the color of the progress bar behind the sliders.

```
secondaryColor=170000
```


**icons**

Changes the design of the icons within the player. can be either "vid" or "default".

```
icons=vid
```


**iconColor**

Changes the color of the icons within the player.

```
iconColor=B20710
```


**title**

Controls whether the media title is displayed.

```
title=false
```


**poster**

Determines if the poster image is shown.

```
poster=true
```


**autoplay**

Controls whether the media starts playing automatically.

```
autoplay=true
```


**Next Episode button**

Shows next episode button when 90% of the Tv-show is watched. OFF by default.

```
nextbutton=true
```


**Player type**New****

Changes the player to JWPlayer or default player.

```
player=jw
```


**startAt**New****

Starts the video at the specified time in seconds. This parameter cannot replace saved progress but can be used for cross-device watch progress. remove cookies and cache after each test for the same content.

```
startAt=60
```


**sub_file**New****

Adds external subtitles to the video. Must be a direct link to a VTT subtitle file.

```
sub_file=https://example.com/subtitles.vtt
```


**sub_label**New****

Sets the label for the external subtitle track. If not provided, defaults to 'External Subtitle'.

```
sub_label=English
```



Example of full features on TV Show:

```
https://vidlink.pro/tv/94605/2/1?primaryColor=D81F26&secondaryColor=a2a2a2&iconColor=eefdec&icons=vid&player=default&title=true&poster=true&autoplay=true&nextbutton=true
```



Example of full features on Movie:

`https://vidlink.pro/movie/840326?primaryColor=D81F26&secondaryColor=a2a2a2&iconColor=eefdec&icons=default&player=default&title=true&poster=true&autoplay=true&nextbutton=true`
