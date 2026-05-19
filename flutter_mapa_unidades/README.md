# Mapa das Unidades - Flutter

Este pacote contém os arquivos prontos para criar a aba **Mapa das Unidades** em um app Flutter.

## Arquivos criados

- `lib/models/school_model.dart`
- `lib/helpers/map_launcher_helper.dart`
- `lib/tabs/school_map_tab.dart`

## Dependências no pubspec.yaml

Adicione no projeto Flutter:

```yaml
dependencies:
  google_maps_flutter: ^2.6.1
  geolocator: ^12.0.0
  url_launcher: ^6.3.0
  google_maps_cluster_manager: ^3.1.0
```

Depois execute:

```bash
flutter pub get
```

## Android

No arquivo `android/app/src/main/AndroidManifest.xml`, antes de `<application>`:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" />
```

Dentro de `<application>`:

```xml
<meta-data
    android:name="com.google.android.geo.API_KEY"
    android:value="SUA_GOOGLE_MAPS_API_KEY_AQUI" />
```

## iOS

No arquivo `ios/Runner/AppDelegate.swift`:

```swift
import GoogleMaps
```

E dentro do método `didFinishLaunchingWithOptions`:

```swift
GMSServices.provideAPIKey("SUA_GOOGLE_MAPS_API_KEY_AQUI")
```

No arquivo `ios/Runner/Info.plist`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Precisamos da sua localização para mostrar as escolas mais próximas.</string>

<key>LSApplicationQueriesSchemes</key>
<array>
    <string>waze</string>
    <string>comgooglemaps</string>
</array>
```

## Como chamar a aba

```dart
SchoolMapTab(
  schools: schools,
)
```

## Formato mínimo da escola

Cada unidade precisa ter:

- `id`
- `name`
- `address`
- `neighborhood`
- `latitude`
- `longitude`

Sem latitude e longitude o pin não aparece no mapa.
